import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { verifySignedTransaction } from "@/lib/iap/verifier";
import {
  fetchSubscriptionPurchase,
  acknowledgeIfNeeded,
  isActive,
  GooglePurchaseNotFoundError,
} from "@/lib/iap/google-verifier";
import { NextResponse } from "next/server";
import { z } from "zod";

// GAL-188 + GAL-273 — server-side verification of an in-app purchase.
// Apple: validates the StoreKit 2 JWS signature, cert chain, bundle id, env.
// Google: calls androidpublisher.purchases.subscriptionsv2.get with the
// service account, validates subscriptionState, acknowledges if needed.
// In both cases the row stores original_purchase_token as the stable
// per-subscription identifier (Apple originalTransactionId / Play
// purchaseToken). transaction_id is the per-renewal order id.

const KNOWN_PREMIUM_PRODUCT_IDS = new Set([
  "com.galleybook.premium.monthly",
  "com.galleybook.premium.annual",
]);

const InputSchema = z.object({
  receipt: z.string().min(1).max(10_000),
  productId: z.string().min(1).max(200),
  transactionId: z.string().min(1).max(200).nullable(),
  galleyId: z.string().uuid(),
  provider: z.enum(["apple", "google"]).default("apple"),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = InputSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.message }, { status: 400 });
  }
  const { receipt, productId, transactionId, galleyId, provider } = body.data;

  if (!KNOWN_PREMIUM_PRODUCT_IDS.has(productId)) {
    logger.warn("iap.verify_receipt.unknown_product", { productId, userId: user.id });
    return NextResponse.json({ error: "Unknown product." }, { status: 400 });
  }

  const { data: membership, error: memberErr } = await supabase
    .from("galley_members")
    .select("galley_id")
    .eq("galley_id", galleyId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (memberErr || !membership) {
    return NextResponse.json({ error: "Not a member of that galley" }, { status: 403 });
  }

  if (provider === "google") {
    return verifyGoogle({
      userId: user.id,
      galleyId,
      productId,
      token: receipt,
    });
  }

  // Verify the JWS signature against Apple's root CAs and decode. The
  // verifier also enforces bundle id + environment match — anything from
  // a different app or a mismatched environment claim throws here.
  let payload;
  try {
    payload = await verifySignedTransaction(receipt);
  } catch (err) {
    logger.warn("iap.verify_receipt.signature_invalid", {
      userId: user.id,
      galleyId,
      productId,
      transactionId,
      message: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json(
      { error: "Receipt could not be verified." },
      { status: 400 },
    );
  }

  // The client-supplied productId must match what Apple signed — defence
  // against tampering by a malicious client passing the legit JWS but
  // claiming a different product.
  if (payload.productId !== productId) {
    logger.warn("iap.verify_receipt.product_mismatch", {
      claimed: productId,
      signed: payload.productId,
      userId: user.id,
    });
    return NextResponse.json(
      { error: "Receipt product does not match request." },
      { status: 400 },
    );
  }

  const expiresAt = payload.expiresDate ? new Date(payload.expiresDate).toISOString() : null;
  const originalTransactionId = payload.originalTransactionId ?? transactionId;
  const effectiveTransactionId = payload.transactionId ?? transactionId;
  const isOfferCode = payload.offerType === 3 && Boolean(payload.offerIdentifier);

  const service = createServiceClient();
  const { error: insertErr } = await service.from("iap_subscriptions").insert({
    user_id: user.id,
    galley_id: galleyId,
    product_id: productId,
    source: isOfferCode ? "apple_offer_code" : "apple_iap",
    status: "active",
    transaction_id: effectiveTransactionId,
    original_transaction_id: originalTransactionId,
    original_purchase_token: originalTransactionId,
    offer_identifier: payload.offerIdentifier ?? null,
    starts_at: new Date().toISOString(),
    expires_at: expiresAt,
    raw_payload: payload as unknown as Record<string, unknown>,
  });
  if (insertErr) {
    if (insertErr.code === "23505") {
      // GAL-321 — Restore re-sends a JWS whose transaction_id is already on
      // file. Two cases hit this branch:
      //   1. Same user restores their own sub → row exists for this user but
      //      expires_at / status may be stale (esp. sandbox accelerated
      //      trials).
      //   2. Different Supabase user logs in with the same Apple ID
      //      (account deletion + re-create, or sandbox testers hopping
      //      between test accounts). The row is currently attached to the
      //      previous user — Apple's "one Apple ID = one subscription"
      //      model says the latest authenticated user owns it.
      // Either way we update the row in place: refresh expiry/status, and
      // re-point user_id/galley_id at whoever just verified the JWS.
      //
      // First, expire any STALE "active" rows for this (user, galley) so
      // the partial unique index iap_subscriptions_one_active_per_user_galley
      // is free for the about-to-be-active row. These are typically previous
      // trials where the sandbox accelerated expiry but no notification
      // landed to flip status → expired.
      const { error: stalePurgeErr } = await service
        .from("iap_subscriptions")
        .update({ status: "expired" })
        .eq("user_id", user.id)
        .eq("galley_id", galleyId)
        .eq("status", "active")
        .neq("transaction_id", effectiveTransactionId);
      if (stalePurgeErr) {
        logger.error("iap.verify_receipt.dedup_stale_purge_failed", {
          userId: user.id,
          galleyId,
          message: stalePurgeErr.message,
        });
        return NextResponse.json({ error: stalePurgeErr.message }, { status: 500 });
      }

      const { error: updateErr } = await service
        .from("iap_subscriptions")
        .update({
          user_id: user.id,
          galley_id: galleyId,
          status: "active",
          expires_at: expiresAt,
          raw_payload: payload as unknown as Record<string, unknown>,
          original_transaction_id: originalTransactionId,
          original_purchase_token: originalTransactionId,
          offer_identifier: payload.offerIdentifier ?? null,
        })
        .eq("transaction_id", effectiveTransactionId);
      if (updateErr) {
        logger.error("iap.verify_receipt.dedup_update_failed", {
          userId: user.id,
          galleyId,
          transactionId: effectiveTransactionId,
          message: updateErr.message,
        });
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }
      logger.info("iap.verify_receipt.dedup_refreshed", {
        userId: user.id,
        galleyId,
        transactionId: effectiveTransactionId,
        expiresAt,
      });
      return NextResponse.json({ ok: true, deduped: true, refreshed: true });
    }
    logger.error("iap.verify_receipt.insert_failed", {
      userId: user.id,
      galleyId,
      productId,
      code: insertErr.code,
      message: insertErr.message,
    });
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  logger.info("iap.verify_receipt.recorded", {
    userId: user.id,
    galleyId,
    productId,
    transactionId: effectiveTransactionId,
    expiresAt,
    environment: payload.environment,
  });
  return NextResponse.json({ ok: true });
}

async function verifyGoogle(args: {
  userId: string;
  galleyId: string;
  productId: string;
  token: string;
}): Promise<Response> {
  const { userId, galleyId, productId, token } = args;

  let purchase;
  try {
    purchase = await fetchSubscriptionPurchase(token);
  } catch (err) {
    if (err instanceof GooglePurchaseNotFoundError) {
      logger.warn("iap.verify_receipt.google.not_found", { userId, galleyId, productId });
      return NextResponse.json(
        { error: "Purchase not found yet — try again in a moment." },
        { status: 404 },
      );
    }
    logger.error("iap.verify_receipt.google.fetch_failed", {
      userId,
      galleyId,
      productId,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Receipt could not be verified." }, { status: 400 });
  }

  if (purchase.productId !== productId) {
    logger.warn("iap.verify_receipt.google.product_mismatch", {
      claimed: productId,
      signed: purchase.productId,
      userId,
    });
    return NextResponse.json(
      { error: "Receipt product does not match request." },
      { status: 400 },
    );
  }

  if (!isActive(purchase)) {
    logger.warn("iap.verify_receipt.google.not_active", {
      userId,
      galleyId,
      productId,
      state: purchase.subscriptionState,
    });
    return NextResponse.json({ error: "Subscription is not active." }, { status: 400 });
  }

  await acknowledgeIfNeeded(token, purchase).catch((err: unknown) => {
    logger.warn("iap.verify_receipt.google.ack_failed", {
      userId,
      galleyId,
      message: err instanceof Error ? err.message : String(err),
    });
  });

  const service = createServiceClient();
  const { error: insertErr } = await service.from("iap_subscriptions").insert({
    user_id: userId,
    galley_id: galleyId,
    product_id: productId,
    source: "google_iap",
    status: "active",
    transaction_id: purchase.latestOrderId,
    original_purchase_token: token,
    starts_at: new Date().toISOString(),
    expires_at: purchase.expiresAt,
    raw_payload: purchase as unknown as Record<string, unknown>,
  });

  if (insertErr) {
    if (insertErr.code === "23505") {
      // Same token replayed (restore / RTDN echo). Refresh expiry + order id;
      // expire any stale active rows for this (user, galley) the same way the
      // Apple path does so the partial unique stays free.
      const { error: stalePurgeErr } = await service
        .from("iap_subscriptions")
        .update({ status: "expired" })
        .eq("user_id", userId)
        .eq("galley_id", galleyId)
        .eq("status", "active")
        .neq("original_purchase_token", token);
      if (stalePurgeErr) {
        logger.error("iap.verify_receipt.google.dedup_stale_purge_failed", {
          userId,
          galleyId,
          message: stalePurgeErr.message,
        });
        return NextResponse.json({ error: stalePurgeErr.message }, { status: 500 });
      }

      const { error: updateErr } = await service
        .from("iap_subscriptions")
        .update({
          user_id: userId,
          galley_id: galleyId,
          status: "active",
          expires_at: purchase.expiresAt,
          transaction_id: purchase.latestOrderId,
          product_id: productId,
          raw_payload: purchase as unknown as Record<string, unknown>,
        })
        .eq("original_purchase_token", token);
      if (updateErr) {
        logger.error("iap.verify_receipt.google.dedup_update_failed", {
          userId,
          galleyId,
          message: updateErr.message,
        });
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }
      logger.info("iap.verify_receipt.google.dedup_refreshed", {
        userId,
        galleyId,
        productId,
        expiresAt: purchase.expiresAt,
      });
      return NextResponse.json({ ok: true, deduped: true, refreshed: true });
    }
    logger.error("iap.verify_receipt.google.insert_failed", {
      userId,
      galleyId,
      productId,
      code: insertErr.code,
      message: insertErr.message,
    });
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  logger.info("iap.verify_receipt.google.recorded", {
    userId,
    galleyId,
    productId,
    expiresAt: purchase.expiresAt,
    state: purchase.subscriptionState,
  });
  return NextResponse.json({ ok: true });
}
