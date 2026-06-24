/**
 * Daily Growth Report cron (GAL-423 / GAL-426).
 *
 * Runs ~08:00 CET (06:00 UTC) via vercel.json. Collects yesterday's metrics
 * (Meta + new users), runs the AI analysis, and upserts one growth_daily_reports
 * row. Also triggerable manually by an admin (for testing) — same endpoint.
 *
 * Email delivery (GAL-428) reuses the existing Resend setup — sent on every
 * scheduled run, and on a manual admin trigger only when `?email=1`.
 */

import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { generateAndStoreDailyReport } from "@/lib/marketing/growth";
import { sendGrowthDailyReport } from "@/lib/email";
import { runTrialNudges } from "@/lib/trial-nudges/run";
import { logger } from "@/lib/logger";

export const maxDuration = 120;

export async function GET(request: Request) {
  // Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. Allow that, or an
  // authenticated admin hitting the URL manually to test a run.
  const isCron =
    request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) {
    const guard = await requireAdminApi();
    if ("response" in guard) return guard.response;
  }

  const emailRequested = new URL(request.url).searchParams.get("email") === "1";

  // GAL-469: the trial-nudge sequence piggybacks on this daily cron — Hobby has
  // no spare cron slot for a dedicated one. Runs only on the scheduled cron (not
  // manual admin hits), independent of the growth report's success, and is
  // itself a no-op dry run until TRIAL_NUDGES_ENABLED === "true".
  const runNudges = async () => {
    if (!isCron) return;
    try {
      const res = await runTrialNudges({
        enabled: process.env.TRIAL_NUDGES_ENABLED === "true",
      });
      logger.info("trial_nudges.piggyback", { enabled: res.enabled, plan: res.plan });
    } catch (e) {
      logger.error("trial_nudges.piggyback_failed", {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };

  try {
    const result = await generateAndStoreDailyReport();

    let emailed = false;
    if (isCron || emailRequested) {
      try {
        await sendGrowthDailyReport(result);
        emailed = true;
      } catch (e) {
        // Never let an email failure fail the report run.
        logger.error("growth.daily_report_email_failed", { message: String(e) });
      }
    }

    await runNudges();
    return NextResponse.json({ ok: true, emailed, ...result });
  } catch (err) {
    // Nudges are independent of the report — still run them if the report threw.
    await runNudges();
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("growth.daily_report_cron_failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
