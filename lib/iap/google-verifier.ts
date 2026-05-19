import { google, androidpublisher_v3 } from "googleapis";
import { IdentityPoolClient } from "google-auth-library";

// GAL-273 — verify a Play purchaseToken via the Android Publisher API.
//
// Auth uses Vercel ↔ GCP Workload Identity Federation (WIF):
//   - Vercel injects VERCEL_OIDC_TOKEN per function invocation.
//   - IdentityPoolClient exchanges that token at sts.googleapis.com
//     and impersonates the service account, which is linked in
//     Play Console with the Android Publisher role.
//   - No long-lived JSON key on disk or in env — tokens are short-lived
//     and minted on demand.

const PACKAGE_NAME = "com.galleyworks.galleybook";
const NOT_FOUND_RETRY_DELAYS_MS = [500, 2000, 5000];

type Schema$SubscriptionPurchaseV2 = androidpublisher_v3.Schema$SubscriptionPurchaseV2;

let cachedClient: androidpublisher_v3.Androidpublisher | null = null;

function buildAuthClient(): IdentityPoolClient {
  const provider = process.env.GCP_WORKLOAD_IDENTITY_PROVIDER;
  const saEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL;
  if (!provider) throw new Error("GCP_WORKLOAD_IDENTITY_PROVIDER is not set");
  if (!saEmail) throw new Error("GCP_SERVICE_ACCOUNT_EMAIL is not set");

  return new IdentityPoolClient({
    type: "external_account",
    audience: `//iam.googleapis.com/${provider}`,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url:
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${saEmail}:generateAccessToken`,
    subject_token_supplier: {
      // Called every time the SDK needs a fresh GCP access token.
      // Vercel injects a new VERCEL_OIDC_TOKEN per function invocation
      // (~15 min validity), so reading the env at call time is correct.
      async getSubjectToken() {
        const token = process.env.VERCEL_OIDC_TOKEN;
        if (!token) {
          throw new Error("VERCEL_OIDC_TOKEN not present — enable OIDC on the Vercel project");
        }
        return token;
      },
    },
  });
}

function getClient(): androidpublisher_v3.Androidpublisher {
  if (cachedClient) return cachedClient;
  const auth = buildAuthClient();
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
