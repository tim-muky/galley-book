/**
 * Trial-nudge sequence — manual / admin entrypoint + dry-run surface.
 *
 * The REAL daily execution is piggybacked on the growth-daily-report cron
 * (app/api/cron/growth-daily-report) because Vercel Hobby has no spare cron slot
 * (GAL-469 / GAL-441). This route is NOT scheduled — it stays for manual admin
 * runs and dry-run review: hit it as an admin while TRIAL_NUDGES_ENABLED is
 * unset to see exactly who WOULD be nudged, touching nothing.
 *
 * The send/targeting logic lives in lib/trial-nudges/run so the daily cron and
 * this route can't drift.
 */

import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { runTrialNudges } from "@/lib/trial-nudges/run";
import { logger } from "@/lib/logger";

export const maxDuration = 120;

export async function GET(request: Request) {
  const isCron =
    request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) {
    const guard = await requireAdminApi();
    if ("response" in guard) return guard.response;
  }

  try {
    const result = await runTrialNudges({
      enabled: process.env.TRIAL_NUDGES_ENABLED === "true",
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("trial_nudges.cron_failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
