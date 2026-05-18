import { createHmac, timingSafeEqual } from "crypto";

/**
 * GAL-336: stateless signed share tokens with a hard expiry. The sharer
 * generates a token tied to a specific recipeId; the public /r/[id] route
 * verifies signature + expiry before serving content. Each share creates a
 * new token; visiting the URL does not extend the window.
 *
 * Compact token format (URL-safe):
 *   base64url(payload).base64url(hmac-sha256)
 *
 * Payload: { r: recipeId, iat: issuedAtSeconds, exp: expiresAtSeconds }
 * Signature: HMAC-SHA256 over the base64-encoded payload, secret from env.
 */

const TOKEN_TTL_SECONDS = 48 * 60 * 60; // 48 hours

interface SharePayload {
  r: string; // recipeId
  iat: number;
  exp: number;
}

function getSecret(): string {
  const secret = process.env.SHARE_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SHARE_TOKEN_SECRET env var missing or too short (>=32 chars required)",
    );
  }
  return secret;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(payloadB64: string, secret: string): string {
  return base64url(
    createHmac("sha256", secret).update(payloadB64).digest(),
  );
}

export function createShareToken(recipeId: string): {
  token: string;
  expiresAt: string;
} {
  const secret = getSecret();
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + TOKEN_TTL_SECONDS;
  const payload: SharePayload = { r: recipeId, iat, exp };
  const payloadB64 = base64url(JSON.stringify(payload));
  const sig = sign(payloadB64, secret);
  return {
    token: `${payloadB64}.${sig}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export type VerifyShareTokenResult =
  | { ok: true; recipeId: string; expiresAt: string }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifyShareToken(token: string): VerifyShareTokenResult {
  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [payloadB64, sigGiven] = parts;
  if (!payloadB64 || !sigGiven) return { ok: false, reason: "malformed" };

  const expectedSig = sign(payloadB64, secret);
  // Constant-time compare to prevent timing-attack signature recovery.
  const given = base64urlDecode(sigGiven);
  const expected = base64urlDecode(expectedSig);
  if (
    given.length !== expected.length ||
    !timingSafeEqual(given, expected)
  ) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: SharePayload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    typeof payload.r !== "string" ||
    typeof payload.exp !== "number" ||
    typeof payload.iat !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) return { ok: false, reason: "expired" };

  return {
    ok: true,
    recipeId: payload.r,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}
