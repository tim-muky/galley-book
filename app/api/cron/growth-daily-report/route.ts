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

    return NextResponse.json({ ok: true, emailed, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("growth.daily_report_cron_failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
