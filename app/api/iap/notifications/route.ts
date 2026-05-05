import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { z } from "zod";

// GAL-189 — Apple App Store Server Notifications V2 webhook.
//
// CURRENT STATE: stub. We decode the JWS payloads but do NOT verify signatures
// against Apple's certificate chain. Pair with /api/iap/verify-receipt — both
// must move to real signature verification before production.
//
// IMPORTANT: this endpoint MUST return 200 on internal errors. Apple retries
// non-2xx aggressively (up to ~3 days) and a flood of failures becomes a
// noisy fire we don't want.

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  signedPayload: z.string().min(1),
});

interface NotificationPayload {
  notificationType?: string;
  subtype?: string;
  notificationUUID?: string;
  data?: {
    bundleId?: string;
    environment?: string;
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };
}

interface TransactionInfo {
  transactionId?: string;
  originalTransactionId?: string;
  productId?: string;
  expiresDate?: number;
  purchaseDate?: number;
  revocationDate?: number;
}

interface RenewalInfo {
  autoRenewStatus?: number; // 0 = off, 1 = on
  expirationIntent?: number;
  isInBillingRetryPeriod?: boolean;
}

function decodeJws<T>(jws: string): T | null {
  const parts = jws.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

type Status = "active" | "expired" | "in_billing_retry" | "cancelled" | "revoked";

function mapNotificationToStatus(
  notificationType: string | undefined,
  renewal: RenewalInfo | null,
): Status | null {
  switch (notificationType) {
    case "SUBSCRIBED":
    case "DID_RENEW":
      return "active";
    case "DID_FAIL_TO_RENEW":
      return renewal?.isInBillingRetryPeriod ? "in_billing_retry" : "expired";
    case "GRACE_PERIOD_EXPIRED":
    case "EXPIRED":
      return "expired";
    case "REVOKE":
    case "REFUND":
      return "revoked";
    case "DID_CHANGE_RENEWAL_STATUS":
      // Auto-renew toggle alone doesn't change current status — sub stays
      // active until expiry. Just record the event.
      return null;
    case "PRICE_INCREASE":
      return null;
    default:
      return null;
  }
}

export async function POST(request: Request) {
  let parsed: NotificationPayload | null = null;
  let txn: TransactionInfo | null = null;

  try {
    const body = BodySchema.safeParse(await request.json());
    if (!body.success) {
      logger.warn("iap.notifications.bad_body", { issue: body.error.message });
      return NextResponse.json({ received: true });
    }
    parsed = decodeJws<NotificationPayload>(body.data.signedPayload);
    if (!parsed) {
      logger.warn("iap.notifications.payload_decode_failed");
      return NextResponse.json({ received: true });
    }

    const txnJws = parsed.data?.signedTransactionInfo;
    txn = txnJws ? decodeJws<TransactionInfo>(txnJws) : null;
    const renewalJws = parsed.data?.signedRenewalInfo;
    const renewal = renewalJws ? decodeJws<RenewalInfo>(renewalJws) : null;

    const originalTransactionId = txn?.originalTransactionId;
    if (!originalTransactionId) {
      logger.warn("iap.notifications.no_original_txn", { type: parsed.notificationType });
      return NextResponse.json({ received: true });
    }

    const status = mapNotificationToStatus(parsed.notificationType, renewal);
    const expiresAt = txn?.expiresDate ? new Date(txn.expiresDate).toISOString() : null;
    const revokedAt = txn?.revocationDate ? new Date(txn.revocationDate).toISOString() : null;

    const update: Record<string, unknown> = {
      raw_payload: { notification: parsed, transaction: txn, renewal },
      updated_at: new Date().toISOString(),
    };
    if (status) update.status = status;
    if (expiresAt) update.expires_at = expiresAt;
    if (revokedAt) update.revoked_at = revokedAt;

    const service = createServiceClient();
    const { data: rows, error } = await service
      .from("iap_subscriptions")
      .update(update)
      .eq("original_transaction_id", originalTransactionId)
      .select("id");

    if (error) {
      logger.error("iap.notifications.update_failed", {
        type: parsed.notificationType,
        originalTransactionId,
        message: error.message,
      });
      return NextResponse.json({ received: true });
    }

    logger.info("iap.notifications.processed", {
      type: parsed.notificationType,
      subtype: parsed.subtype,
      status,
      originalTransactionId,
      rowsUpdated: rows?.length ?? 0,
    });
    return NextResponse.json({ received: true });
  } catch (err) {
    logger.error("iap.notifications.unhandled", {
      message: err instanceof Error ? err.message : String(err),
      type: parsed?.notificationType,
    });
    return NextResponse.json({ received: true });
  }
}
