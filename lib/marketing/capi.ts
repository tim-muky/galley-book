/**
 * Meta Conversions API — server-side signup event (GAL-47 follow-up).
 *
 * Signup happens via Google OAuth on app.galleybook.com, which the browser
 * pixel on the landing page can't observe. We fire `CompleteRegistration`
 * server-side from the auth callback so the Advantage+ campaign has a real
 * conversion signal to optimize on.
 *
 * Best-effort: callers must never let this block the auth flow.
 */

import crypto from "node:crypto";
import { logger } from "@/lib/logger";
import { META } from "./meta-config";

const GRAPH = "https://graph.facebook.com/v25.0";

/** Meta requires PII hashed: SHA-256 of the normalized (trim + lowercase) value. */
function hash(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export interface CompleteRegistrationInput {
  email: string;
  /** Stable per-signup id for browser/server dedup, e.g. `signup_<userId>`. */
  eventId: string;
  clientIp?: string | null;
  userAgent?: string | null;
  eventSourceUrl?: string | null;
}

/**
 * Send a CompleteRegistration event. No-op if CAPI isn't configured
 * (META_CAPI_TOKEN unset). Never throws — logs and returns on failure.
 */
export async function sendCompleteRegistration(input: CompleteRegistrationInput): Promise<void> {
  const token = process.env.META_CAPI_TOKEN;
  if (!token) return; // CAPI not configured — silently skip.

  const userData: Record<string, unknown> = { em: [hash(input.email)] };
  if (input.clientIp) userData.client_ip_address = input.clientIp;
  if (input.userAgent) userData.client_user_agent = input.userAgent;

  const payload = {
    data: [
      {
        event_name: "CompleteRegistration",
        event_time: Math.floor(Date.now() / 1000),
        event_id: input.eventId,
        action_source: "website",
        ...(input.eventSourceUrl ? { event_source_url: input.eventSourceUrl } : {}),
        user_data: userData,
      },
    ],
  };

  try {
    const res = await fetch(
      `${GRAPH}/${META.pixelId}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.error("capi.complete_registration_failed", {
        status: res.status,
        body: body.slice(0, 300),
      });
      return;
    }
    logger.info("capi.complete_registration_sent", { eventId: input.eventId });
  } catch (e) {
    logger.error("capi.complete_registration_error", {
      message: e instanceof Error ? e.message : String(e),
    });
  }
}
