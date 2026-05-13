import { google, androidpublisher_v3 } from "googleapis";

// GAL-273 — verify a Play purchaseToken via the Android Publisher API.
//
// The service-account JSON is loaded from GOOGLE_PLAY_SA_JSON (raw or
// base64-encoded — Vercel's multi-line env handling sometimes mangles raw
// JSON, so base64 is the safe form to paste). The same SA must be linked
// in Play Console under Users & Permissions with the Android Publisher
// role.

const PACKAGE_NAME = "com.galleyworks.galleybook";
const NOT_FOUND_RETRY_DELAYS_MS = [500, 2000, 5000];

type Schema$SubscriptionPurchaseV2 = androidpublisher_v3.Schema$SubscriptionPurchaseV2;

let cachedClient: androidpublisher_v3.Androidpublisher | null = null;

function loadServiceAccountJson(): Record<string, unknown> {
  const raw = process.env.GOOGLE_PLAY_SA_JSON;
  if (!raw) {
    throw new Error("GOOGLE_PLAY_SA_JSON is not set");
  }
  const trimmed = raw.trim();
  const text = trimmed.startsWith("{")
    ? trimmed
    : Buffer.from(trimmed, "base64").toString("utf8");
  return JSON.parse(text);
}

function getClient(): androidpublisher_v3.Androidpublisher {
  if (cachedClient) return cachedClient;
  const credentials = loadServiceAccountJson();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  cachedClient = google.androidpublisher({ version: "v3", auth });
  return cachedClient;
}

export type GooglePurchase = Schema$SubscriptionPurchaseV2 & {
  productId: string;
  expiresAt: string;
  latestOrderId: string | null;
};

export class GooglePurchaseNotFoundError extends Error {
  constructor(public token: string) {
    super("Play purchase token not found after retries");
    this.name = "GooglePurchaseNotFoundError";
  }
}

export async function fetchSubscriptionPurchase(token: string): Promise<GooglePurchase> {
  const client = getClient();

  let attempt = 0;
  while (true) {
    try {
      const { data } = await client.purchases.subscriptionsv2.get({
        packageName: PACKAGE_NAME,
        token,
      });
      const lineItem = data.lineItems?.[0];
      const productId = lineItem?.productId;
      const expiry = lineItem?.expiryTime;
      if (!productId || !expiry) {
        throw new Error("Play purchase has no line item / expiry");
      }
      return {
        ...data,
        productId,
        expiresAt: expiry,
        latestOrderId: data.latestOrderId ?? null,
      };
    } catch (err: unknown) {
      const status = (err as { code?: number }).code;
      if (status === 404 && attempt < NOT_FOUND_RETRY_DELAYS_MS.length) {
        await new Promise((r) => setTimeout(r, NOT_FOUND_RETRY_DELAYS_MS[attempt]));
        attempt += 1;
        continue;
      }
      if (status === 404) {
        throw new GooglePurchaseNotFoundError(token);
      }
      throw err;
    }
  }
}

export function isActive(purchase: GooglePurchase): boolean {
  // SUBSCRIPTION_STATE_ACTIVE | SUBSCRIPTION_STATE_IN_GRACE_PERIOD count as
  // entitled. Cancelled-but-not-expired also grants access until expiry.
  return (
    purchase.subscriptionState === "SUBSCRIPTION_STATE_ACTIVE" ||
    purchase.subscriptionState === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD" ||
    purchase.subscriptionState === "SUBSCRIPTION_STATE_CANCELED"
  );
}

export async function acknowledgeIfNeeded(
  token: string,
  purchase: GooglePurchase,
): Promise<void> {
  if (purchase.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED") return;
  const productId = purchase.productId;
  await getClient().purchases.subscriptions.acknowledge({
    packageName: PACKAGE_NAME,
    subscriptionId: productId,
    token,
  });
}
