#!/usr/bin/env node
// Generate an Apple Sign in with Apple client_secret JWT.
// Usage: node generate-apple-client-secret.mjs <TEAM_ID> <KEY_ID> <SERVICES_ID> <PATH_TO_P8>
// JWT max lifetime per Apple is 6 months — re-run before expiry.

import crypto from "node:crypto";
import fs from "node:fs";

const [, , teamId, keyId, servicesId, p8Path] = process.argv;
if (!teamId || !keyId || !servicesId || !p8Path) {
  console.error("Usage: node generate-apple-client-secret.mjs <TEAM_ID> <KEY_ID> <SERVICES_ID> <PATH_TO_P8>");
  process.exit(1);
}

const privateKey = crypto.createPrivateKey({
  key: fs.readFileSync(p8Path, "utf8"),
  format: "pem",
});

const now = Math.floor(Date.now() / 1000);
const header = { alg: "ES256", kid: keyId, typ: "JWT" };
const payload = {
  iss: teamId,
  iat: now,
  exp: now + 60 * 60 * 24 * 180,
  aud: "https://appleid.apple.com",
  sub: servicesId,
};

const b64url = (obj) =>
  Buffer.from(JSON.stringify(obj)).toString("base64url");

const signingInput = `${b64url(header)}.${b64url(payload)}`;
const signature = crypto
  .sign("SHA256", Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  })
  .toString("base64url");

const jwt = `${signingInput}.${signature}`;
console.log(jwt);
console.error(`\nExpires: ${new Date((now + 60 * 60 * 24 * 180) * 1000).toISOString()}`);
