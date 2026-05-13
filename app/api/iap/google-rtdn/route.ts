import { OAuth2Client } from "google-auth-library";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { fetchSubscriptionPurchase, isActive } from "@/lib/iap/google-verifier";
import { NextResponse } from "next/server";

// GAL-274 — Play Real-Time Developer Notifications (RTDN) webhook.
//
// Pub/Sub push → POST here. We verify Google's signed JWT against the
// configured audience (the push-subscription's `audience` field, which the
// push subscription requires when "authenticate push requests" is on), decode
// the DeveloperNotification payload, and update iap_subscriptions by
// original_purchase_token (the stable Play purchaseToken).
//
// Must always 200 — non-2xx triggers Google's retry-with-backoff and a flood
// of failures becomes a noisy fire. Errors are logged, not surfaced.

export const dynamic = "force-dynamic";

const oauthClient = new OAuth2Client();

type SubscriptionNotification = {
  version: string;
  notificationType: number;
  purchaseToken: string;
  subscriptionId: string;
};

type DeveloperNotification = {
  version: string;
  packageName: string;
  eventTimeMillis: string;
  subscriptionNotification?: SubscriptionNotification;
  testNotification?: { version: string };
  voidedPurchaseNotification?: {
    purchaseToken: string;
    orderId: string;
    productType: number;
    refundType: number;
  };
};

// https://developer.android.com/google/play/billing/rtdn-reference#sub
const NTYPE_RECOVERED = 1;
const NTYPE_RENEWED = 2;
const NTYPE_CANCELED = 3;
const NTYPE_PURCHASED = 4;
const NTYPE_ON_HOLD = 5;
const NTYPE_IN_GRACE_PERIOD = 6;
const NTYPE_RESTARTED = 7;
const NTYPE_PRICE_CHANGE_CONFIRMED = 8;
const NTYPE_DEFERRED = 9;
const NTYPE_PAUSED = 10;
const NTYPE_PAUSE_SCHEDULE_CHANGED = 11;
const NTYPE_REVOKED = 12;
const NTYPE_EXPIRED = 13;
const NTYPE_PENDING_PURCHASE_CANCELED = 20;

async function verifyPushJwt(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice("Bearer ".length);
  const audience = process.env.GOOGLE_PLAY_RTDN_AUDIENCE;
  if (!audience) {
    logger.error("iap.rtdn.missing_audience_env");
    return false;
  }
  try {
    const ticket = await oauthClient.verifyIdToken({ idToken: token, audience });
    const payload = ticket.getPayload();
    return Boolean(payload?.email_verified ?? payload?.iss === "accounts.google.com");
  } catch (err) {
    logger.warn("iap.rtdn.jwt_verify_failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export async function POST(request: Request) {
  if (!(await verifyPushJwt(request.headers.get("authorization")))) {
    return NextResponse.json({ received: false }, { status: 401 });
  }

  let envelope: { message?: { data?: string; messageId?: string } };
  try {
    envelope = await request.json();
  } catch {
    return NextResponse.json({ received: true });
  }

  const dataB64 = envelope.message?.data;
  if (!dataB64) {
    logger.warn("iap.rtdn.empty_message", { messageId: envelope.message?.messageId });
    return NextResponse.json({ received: true });
  }

  let notification: DeveloperNotification;
  try {
    notification = JSON.parse(Buffer.from(dataB64, "base64").toString("utf8"));
  } catch (err) {
    logger.warn("iap.rtdn.bad_payload", {
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ received: true });
  }

  if (notification.testNotification) {
    logger.info("iap.rtdn.test", { eventTimeMillis: notification.eventTimeMillis });
    return NextResponse.json({ received: true });
  }

  const sub = notification.subscriptionNotification;
  if (sub) {
    await handleSubscriptionNotification(sub).catch((err) => {
      logger.error("iap.rtdn.subscription_failed", {
        notificationType: sub.notificationType,
        purchaseToken: sub.purchaseToken,
        message: err instanceof Error ? err.message : String(err),
      });
    });
  }

  const voided = notification.voidedPurchaseNotification;
  if (voided) {
    await handleVoidedPurchase(voided.purchaseToken, voided.refundType).catch((err) => {
      logger.error("iap.rtdn.voided_failed", {
        purchaseToken: voided.purchaseToken,
        message: err instanceof Error ? err.message : String(err),
      });
    });
  }

  return NextResponse.json({ received: true });
}

async function handleSubscriptionNotification(sub: SubscriptionNotification): Promise<void> {
  const { notificationType, purchaseToken } = sub;

  // States that don't change entitlement (auto-renew toggles, price
  // confirmations, pause schedule changes, deferred upgrades, pending purchase
  // cancellations): just log and exit.
  if (
    notificationType === NTYPE_PRICE_CHANGE_CONFIRMED ||
    notificationType === NTYPE_DEFERRED ||
    notificationType === NTYPE_PAUSE_SCHEDULE_CHANGED ||
    notificationType === NTYPE_PENDING_PURCHASE_CANCELED
  ) {
    logger.info("iap.rtdn.no_op", { notificationType, purchaseToken });
    return;
  }

  const service = createServiceClient();

  if (notificationType === NTYPE_EXPIRED || notificationType === NTYPE_REVOKED) {
    const { error } = await service
      .from("iap_subscriptions")
      .update({
        status: notificationType === NTYPE_REVOKED ? "revoked" : "expired",
        expires_at: new Date().toISOString(),
      })
      .eq("original_purchase_token", purchaseToken);
    if (error) throw error;
    logger.info("iap.rtdn.terminated", { notificationType, purchaseToken });
    return;
  }

  // Renewals / new purchase / recovery / restart / grace / hold / paused /
  // canceled (still active until expiry): re-fetch authoritative state and
  // UPSERT.
  let purchase;
  try {
    purchase = await fetchSubscriptionPurchase(purchaseToken);
  } catch (err) {
    logger.warn("iap.rtdn.fetch_failed", {
      notificationType,
      purchaseToken,
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  const status = mapStateToStatus(purchase.subscriptionState ?? null, notificationType);
  if (!status) {
    logger.info("iap.rtdn.unmapped_state", {
      notificationType,
      state: purchase.subscriptionState,
    });
    return;
  }

  const update: Record<string, unknown> = {
    status,
    expires_at: purchase.expiresAt,
    transaction_id: purchase.latestOrderId,
    product_id: purchase.productId,
    raw_payload: purchase as unknown as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  };

  const { data: rows, error } = await service
    .from("iap_subscriptions")
    .update(update)
    .eq("original_purchase_token", purchaseToken)
    .select("id");

  if (error) throw error;
  logger.info("iap.rtdn.applied", {
    notificationType,
    purchaseToken,
    state: purchase.subscriptionState,
    status,
    rowsUpdated: rows?.length ?? 0,
  });
}

async function handleVoidedPurchase(purchaseToken: string, refundType: number): Promise<void> {
  // refundType: 1 = FULL, 2 = QUANTITY (in-app only). Subscriptions: full refund.
  const service = createServiceClient();
  const { error } = await service
    .from("iap_subscriptions")
    .update({
      status: "revoked",
      expires_at: new Date().toISOString(),
      revoked_at: new Date().toISOString(),
    })
    .eq("original_purchase_token", purchaseToken);
  if (error) throw error;
  logger.info("iap.rtdn.voided", { purchaseToken, refundType });
}

function mapStateToStatus(
  state: string | null,
  notificationType: number,
): "active" | "expired" | "in_billing_retry" | "cancelled" | "revoked" | null {
  if (notificationType === NTYPE_CANCELED) return "cancelled";
  if (notificationType === NTYPE_ON_HOLD) return "in_billing_retry";
  switch (state) {
    case "SUBSCRIPTION_STATE_ACTIVE":
    case "SUBSCRIPTION_STATE_IN_GRACE_PERIOD":
      return "active";
    case "SUBSCRIPTION_STATE_CANCELED":
      return "cancelled";
    case "SUBSCRIPTION_STATE_ON_HOLD":
      return "in_billing_retry";
    case "SUBSCRIPTION_STATE_EXPIRED":
      return "expired";
    default:
      return null;
  }
}
