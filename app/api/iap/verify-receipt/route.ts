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
import { computeEntitlement } from "@/lib/iap/entitlement";
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
  // GAL-544: why this receipt is being verified. Launch-time drains re-send
  // every historical StoreKit receipt, so they must never re-point a row that
  // belongs to a different user — otherwise two accounts sharing one Apple ID
  // (or Apple Family) steal the sub from each other on every cold start.
  // Only a deliberate user action (purchase, Restore tap) may claim a row.
  // Defaults to "drain" so pre-GAL-544 clients get the safe behavior.
  intent: z.enum(["purchase", "restore", "drain"]).default("drain"),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = InputSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.message }, { status: 400 });
  }
  const { receipt, productId, transactionId, galleyId, provider, intent } = body.data;

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
      intent,
      userCreatedAt: user.created_at,
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

  // GAL-545: restores/drains replay the user's ENTIRE StoreKit history, old
  // dead receipts included. Status must reflect what the receipt actually says
  // — recording a June receipt as 'active' in September corrupts every reader
  // still keyed on status (and used to flip the genuinely live row to
  // 'expired' via the stale-purge below).
  const receiptIsLive = !expiresAt || new Date(expiresAt).getTime() > Date.now();
  const derivedStatus = receiptIsLive ? "active" : "expired";

  const service = createServiceClient();
  const appleRow = {
    user_id: user.id,
    galley_id: galleyId,
    product_id: productId,
    source: isOfferCode ? "apple_offer_code" : "apple_iap",
    status: derivedStatus,
    transaction_id: effectiveTransactionId,
    original_transaction_id: originalTransactionId,
    original_purchase_token: originalTransactionId,
    offer_identifier: payload.offerIdentifier ?? null,
    starts_at: new Date().toISOString(),
    expires_at: expiresAt,
    raw_payload: payload as unknown as Record<string, unknown>,
  };
  const { error: insertErr } = await service.from("iap_subscriptions").insert(appleRow);
  if (insertErr) {
    if (insertErr.code === "23505") {
      // A 23505 here can come from EITHER of two unique constraints:
      //   (a) transaction_id UNIQUE — the same receipt replayed (Restore, a
      //       cold-start redelivery, or a different Supabase user re-verifying
      //       the same Apple transaction after account deletion + re-create).
      //   (b) the partial unique iap_subscriptions_one_active_per_user_galley —
      //       a NEW renewal / re-subscribe transaction arriving while a
      //       DIFFERENT active row already exists for this (user, galley).
      //
      // GAL-488: the old code assumed (a) and only ran UPDATE ... WHERE
      // transaction_id = effectiveTransactionId. Under (b) that WHERE matches
      // ZERO rows, so the stale-purge below expired the good active row while
      // the renewal was never written — leaving the lineage with NO active row
      // and trapping a fully-paid user behind the paywall. Look the transaction
      // up to tell the two cases apart and handle each.
      const { data: existingByTxn } = await service
        .from("iap_subscriptions")
        .select("id, user_id")
        .eq("transaction_id", effectiveTransactionId)
        .maybeSingle();

      // GAL-544: a launch-time drain must never claim a row that belongs to a
      // different (still existing) user. Re-pointing here is what made two
      // accounts on one Apple ID / Apple Family steal the sub from each other
      // on every cold start, bouncing the losing account to the paywall. Only
      // a deliberate user action (purchase, Restore tap) may re-point.
      if (existingByTxn && existingByTxn.user_id !== user.id && intent === "drain") {
        logger.info("iap.verify_receipt.drain_skipped_foreign_row", {
          userId: user.id,
          galleyId,
          transactionId: effectiveTransactionId,
        });
        const entitlement = await computeEntitlement(
          service,
          user.id,
          galleyId,
          user.created_at,
        );
        return NextResponse.json({ ok: true, deduped: true, skipped: true, entitlement });
      }

      // Free the partial unique: expire any OTHER active Apple rows for this
      // (user, galley). GAL-343: scope the sweep to Apple sources — comp
      // entitlements (staff-granted) MUST NOT be expired by an Apple verify,
      // which used to turn every restore on a comp'd account into "lose your
      // comp". Google rows sit in their own lane and are left untouched.
      // GAL-545: only a LIVE incoming receipt may purge — an old dead receipt
      // replayed by a restore must not expire the genuinely active row. (A
      // dead receipt can only conflict on transaction_id, never on the
      // active-rows partial unique, so skipping the purge is always safe.)
      if (receiptIsLive) {
        const { error: stalePurgeErr } = await service
          .from("iap_subscriptions")
          .update({ status: "expired" })
          .eq("user_id", user.id)
          .eq("galley_id", galleyId)
          .eq("status", "active")
          .neq("transaction_id", effectiveTransactionId)
          .in("source", ["apple_iap", "apple_offer_code"]);
        if (stalePurgeErr) {
          logger.error("iap.verify_receipt.dedup_stale_purge_failed", {
            userId: user.id,
            galleyId,
            message: stalePurgeErr.message,
          });
          return NextResponse.json({ error: stalePurgeErr.message }, { status: 500 });
        }
      }

      if (existingByTxn) {
        // (a) Replay — refresh the row already on file in place, re-pointing
        // user_id/galley_id at whoever just verified the JWS (deliberate
        // purchase/restore only — the drain case returned above).
        const { error: updateErr } = await service
          .from("iap_subscriptions")
          .update({
            user_id: user.id,
            galley_id: galleyId,
            status: derivedStatus,
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
      } else {
        // (b) New renewal / re-subscribe — the conflicting active row is now
        // expired, so the fresh transaction can finally be written.
        const { error: reinsertErr } = await service
          .from("iap_subscriptions")
          .insert(appleRow);
        if (reinsertErr) {
          logger.error("iap.verify_receipt.dedup_reinsert_failed", {
            userId: user.id,
            galleyId,
            transactionId: effectiveTransactionId,
            message: reinsertErr.message,
          });
          return NextResponse.json({ error: reinsertErr.message }, { status: 500 });
        }
      }
      logger.info("iap.verify_receipt.dedup_refreshed", {
        userId: user.id,
        galleyId,
        transactionId: effectiveTransactionId,
        expiresAt,
        mode: existingByTxn ? "replay" : "renewal",
      });
      // GAL-341: include the authoritative entitlement so the client doesn't
      // need a follow-up /api/iap/status round-trip (which can hit a stale
      // read in the moment after this write).
      const entitlement = await computeEntitlement(
        service,
        user.id,
        galleyId,
        user.created_at,
      );
      return NextResponse.json({
        ok: true,
        deduped: true,
        refreshed: true,
        entitlement,
      });
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
  // GAL-341: return the authoritative entitlement so the client can skip
  // the immediate /api/iap/status call (read-after-write race window).
  const entitlement = await computeEntitlement(
    service,
    user.id,
    galleyId,
    user.created_at,
  );
  return NextResponse.json({ ok: true, entitlement });
}

async function verifyGoogle(args: {
  userId: string;
  galleyId: string;
  productId: string;
  token: string;
  intent: "purchase" | "restore" | "drain";
  userCreatedAt?: string | null;
}): Promise<Response> {
  const { userId, galleyId, productId, token, intent, userCreatedAt } = args;

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
      // Apple path does so the partial unique stays free. Defensive source
      // filter mirrors the Apple branch (GAL-343) — never sweep comp/trial
      // entitlements just because the user happens to have a Google row.
      //
      // GAL-544: mirror the Apple ownership guard — an automatic replay must
      // not claim a row that belongs to a different user (shared Play account
      // across two galleybook logins). Deliberate purchase/restore may.
      const { data: existingByToken } = await service
        .from("iap_subscriptions")
        .select("id, user_id")
        .eq("original_purchase_token", token)
        .maybeSingle();
      if (existingByToken && existingByToken.user_id !== userId && intent === "drain") {
        logger.info("iap.verify_receipt.google.drain_skipped_foreign_row", {
          userId,
          galleyId,
        });
        const entitlement = await computeEntitlement(service, userId, galleyId, userCreatedAt);
        return NextResponse.json({ ok: true, deduped: true, skipped: true, entitlement });
      }

      const { error: stalePurgeErr } = await service
        .from("iap_subscriptions")
        .update({ status: "expired" })
        .eq("user_id", userId)
        .eq("galley_id", galleyId)
        .eq("status", "active")
        .eq("source", "google_iap")
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
      // GAL-341 parity with the Apple path: return the authoritative
      // entitlement so the client skips the racy /api/iap/status follow-up.
      const entitlement = await computeEntitlement(service, userId, galleyId, userCreatedAt);
      return NextResponse.json({ ok: true, deduped: true, refreshed: true, entitlement });
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
  const entitlement = await computeEntitlement(service, userId, galleyId, userCreatedAt);
  return NextResponse.json({ ok: true, entitlement });
}
