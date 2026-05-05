import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { z } from "zod";

// GAL-188 — server-side verification of an Apple StoreKit 2 transaction.
//
// CURRENT STATE: stub. We do NOT verify the JWS signature against Apple yet.
// Once the App Store Connect In-App Purchase API key (.p8 + Key ID + Issuer
// ID) is configured we'll add proper verification via App Store Server API.
// Until then this trusts the client-supplied JWS for its expiry claim. Safe
// for TestFlight only — must be replaced before production submission.

const InputSchema = z.object({
  receipt: z.string().min(1).max(10_000),
  productId: z.string().min(1).max(200),
  transactionId: z.string().min(1).max(200).nullable(),
  galleyId: z.string().uuid(),
});

interface JwsTransactionPayload {
  productId?: string;
  transactionId?: string;
  originalTransactionId?: string;
  expiresDate?: number; // ms since epoch
  purchaseDate?: number;
  offerIdentifier?: string;
  // Apple's offerType: 1 = introductory, 2 = promotional, 3 = subscription offer code
  offerType?: number;
}

function decodeJwsPayload(jws: string): JwsTransactionPayload | null {
  const parts = jws.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(json) as JwsTransactionPayload;
  } catch {
    return null;
  }
}

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

  const payload = decodeJwsPayload(receipt);
  const expiresAtMs = payload?.expiresDate;
  const expiresAt = expiresAtMs ? new Date(expiresAtMs).toISOString() : null;
  const originalTransactionId = payload?.originalTransactionId ?? transactionId;
  const effectiveTransactionId = payload?.transactionId ?? transactionId;

  const isOfferCode = payload?.offerType === 3 && Boolean(payload.offerIdentifier);

  const service = createServiceClient();
  const { error: insertErr } = await service.from("iap_subscriptions").insert({
    user_id: user.id,
    galley_id: galleyId,
    product_id: productId,
    source: isOfferCode ? "apple_offer_code" : "apple_iap",
    status: "active",
    transaction_id: effectiveTransactionId,
    original_transaction_id: originalTransactionId,
    offer_identifier: payload?.offerIdentifier ?? null,
    starts_at: new Date().toISOString(),
    expires_at: expiresAt,
    raw_payload: payload ?? { jws_unparsed: true },
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
    stub: true,
  });
  return NextResponse.json({ ok: true });
}
