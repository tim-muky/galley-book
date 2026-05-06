import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { verifySignedTransaction } from "@/lib/iap/verifier";
import { NextResponse } from "next/server";
import { z } from "zod";

// GAL-188 — server-side verification of an Apple StoreKit 2 transaction.
// JWS signature + cert chain + bundle id + environment are validated by
// Apple's official @apple/app-store-server-library SignedDataVerifier
// before we trust any claim from the payload.

const InputSchema = z.object({
  receipt: z.string().min(1).max(10_000),
  productId: z.string().min(1).max(200),
  transactionId: z.string().min(1).max(200).nullable(),
  galleyId: z.string().uuid(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = InputSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.message }, { status: 400 });
  }
  const { receipt, productId, transactionId, galleyId } = body.data;

  const { data: membership, error: memberErr } = await supabase
    .from("galley_members")
    .select("galley_id")
    .eq("galley_id", galleyId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (memberErr || !membership) {
    return NextResponse.json({ error: "Not a member of that galley" }, { status: 403 });
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
    offer_identifier: payload.offerIdentifier ?? null,
    starts_at: new Date().toISOString(),
    expires_at: expiresAt,
    raw_payload: payload as unknown as Record<string, unknown>,
  });
  if (insertErr) {
    if (insertErr.code === "23505") {
      logger.info("iap.verify_receipt.dedup", { userId: user.id, galleyId, transactionId: effectiveTransactionId });
      return NextResponse.json({ ok: true, deduped: true });
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
