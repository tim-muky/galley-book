import { readFileSync } from "fs";
import path from "path";
import {
  Environment,
  SignedDataVerifier,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
  type JWSRenewalInfoDecodedPayload,
} from "@apple/app-store-server-library";

// GAL-188 + GAL-189 — wraps Apple's official SignedDataVerifier so the
// verify-receipt route + the App Store Server Notifications V2 webhook
// trust the JWS payload they receive (signature + cert chain + bundle id +
// environment all checked) instead of decoding the unsigned base64 body.
//
// Two separate verifier instances — one per environment. Apple's library
// rejects payloads whose `environment` field doesn't match the one it was
// constructed with, so we route by inspecting the JWS payload first.

const BUNDLE_ID = "com.galleyworks.galleybook";
const APP_APPLE_ID = 6764606059;

function loadAppleRootCerts(): Buffer[] {
  const dir = path.join(process.cwd(), "lib/iap/apple-root-certs");
  return [
    "AppleIncRootCertificate.cer",
    "AppleRootCA-G2.cer",
    "AppleRootCA-G3.cer",
    "AppleComputerRootCertificate.cer",
  ].map((name) => readFileSync(path.join(dir, name)));
}

let cachedRoots: Buffer[] | null = null;
function rootCerts(): Buffer[] {
  if (!cachedRoots) cachedRoots = loadAppleRootCerts();
  return cachedRoots;
}

let cachedProdVerifier: SignedDataVerifier | null = null;
let cachedSandboxVerifier: SignedDataVerifier | null = null;

function productionVerifier(): SignedDataVerifier {
  if (!cachedProdVerifier) {
    cachedProdVerifier = new SignedDataVerifier(
      rootCerts(),
      true,
      Environment.PRODUCTION,
      BUNDLE_ID,
      APP_APPLE_ID,
    );
  }
  return cachedProdVerifier;
}

function sandboxVerifier(): SignedDataVerifier {
  if (!cachedSandboxVerifier) {
    cachedSandboxVerifier = new SignedDataVerifier(
      rootCerts(),
      false, // disable online OCSP for sandbox; sandbox certs aren't always reachable
      Environment.SANDBOX,
      BUNDLE_ID,
      APP_APPLE_ID,
    );
  }
  return cachedSandboxVerifier;
}

/**
 * Decode the JWS payload (without signature verification) just to inspect
 * the `environment` claim — needed to pick the right verifier. The full
 * verify call below then enforces the signature + cert chain + bundle id +
 * environment match, so this peek can't be used to spoof anything.
 */
function peekEnvironment(jws: string): Environment | null {
  const parts = jws.split(".");
  if (parts.length !== 3) return null;
  try {
    const claim = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      environment?: string;
    };
    if (claim.environment === "Sandbox") return Environment.SANDBOX;
    if (claim.environment === "Production") return Environment.PRODUCTION;
    return null;
  } catch {
    return null;
  }
}

function pickVerifier(jws: string): SignedDataVerifier {
  const env = peekEnvironment(jws);
  return env === Environment.SANDBOX ? sandboxVerifier() : productionVerifier();
}

export async function verifySignedTransaction(
  signedTransaction: string,
): Promise<JWSTransactionDecodedPayload> {
  return pickVerifier(signedTransaction).verifyAndDecodeTransaction(signedTransaction);
}

export async function verifySignedNotification(
  signedPayload: string,
): Promise<ResponseBodyV2DecodedPayload> {
  return pickVerifier(signedPayload).verifyAndDecodeNotification(signedPayload);
}

export async function verifySignedRenewalInfo(
  signedRenewalInfo: string,
): Promise<JWSRenewalInfoDecodedPayload> {
  return pickVerifier(signedRenewalInfo).verifyAndDecodeRenewalInfo(signedRenewalInfo);
}
