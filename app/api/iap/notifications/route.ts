import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import {
  verifySignedNotification,
  verifySignedTransaction,
  verifySignedRenewalInfo,
} from "@/lib/iap/verifier";
import { NextResponse } from "next/server";
import { z } from "zod";

// GAL-189 — Apple App Store Server Notifications V2 webhook.
//
// JWS payloads are signature-verified by Apple's official
// @apple/app-store-server-library before any claim is trusted. The wrapping
// notification, the embedded transaction info, and the renewal info each go
// through their own verify-and-decode call.
//
// IMPORTANT: this endpoint MUST return 200 on internal errors. Apple retries
// non-2xx aggressively (up to ~3 days) and a flood of failures becomes a
// noisy fire we don't want.

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  signedPayload: z.string().min(1),
});

type Status = "active" | "expired" | "in_billing_retry" | "cancelled" | "revoked";

function mapNotificationToStatus(
  notificationType: string | undefined,
  renewal: { isInBillingRetryPeriod?: boolean } | null,
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
  let notificationType: string | undefined;

  try {
    const body = BodySchema.safeParse(await request.json());
    if (!body.success) {
      logger.warn("iap.notifications.bad_body", { issue: body.error.message });
      return NextResponse.json({ received: true });
    }

    // Verify the outer notification — signature + cert chain + bundle id +
    // environment all enforced by Apple's library. Reject quietly on
    // failure (still 200 so Apple doesn't retry-flood) but warn-log so we
    // can spot forgeries / cert misconfig.
    let notification;
    try {
      notification = await verifySignedNotification(body.data.signedPayload);
    } catch (err) {
      logger.warn("iap.notifications.signature_invalid", {
        message: err instanceof Error ? err.message : "unknown",
      });
      return NextResponse.json({ received: true });
    }
    notificationType = notification.notificationType;

    const txnJws = notification.data?.signedTransactionInfo;
    const renewalJws = notification.data?.signedRenewalInfo;

    const txn = txnJws ? await verifySignedTransaction(txnJws).catch(() => null) : null;
    const renewal = renewalJws
      ? await verifySignedRenewalInfo(renewalJws).catch(() => null)
      : null;

    const originalTransactionId = txn?.originalTransactionId;
    if (!originalTransactionId) {
      logger.warn("iap.notifications.no_original_txn", { type: notificationType });
      return NextResponse.json({ received: true });
    }

    const status = mapNotificationToStatus(notificationType, renewal);
    const expiresAt = txn?.expiresDate ? new Date(txn.expiresDate).toISOString() : null;
    const revokedAt = txn?.revocationDate ? new Date(txn.revocationDate).toISOString() : null;

    const update: Record<string, unknown> = {
      raw_payload: { notification, transaction: txn, renewal },
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
        type: notificationType,
        originalTransactionId,
        message: error.message,
      });
      return NextResponse.json({ received: true });
    }

    logger.info("iap.notifications.processed", {
      type: notificationType,
      subtype: notification.subtype,
      status,
      originalTransactionId,
      rowsUpdated: rows?.length ?? 0,
    });
    return NextResponse.json({ received: true });
  } catch (err) {
    logger.error("iap.notifications.unhandled", {
      message: err instanceof Error ? err.message : String(err),
      type: notificationType,
    });
    return NextResponse.json({ received: true });
  }
}
