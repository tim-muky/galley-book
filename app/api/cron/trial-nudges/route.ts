/**
 * Trial-nudge sequence cron.
 *
 * Every new signup gets 3 days of full premium (lib/iap/entitlement.ts). Nobody
 * was being nudged during that window, so trials silently expired. This fans out
 * a 3-touch sequence to convert trial → paid:
 *   - day 1 — activation push (or a reinforce push if they already saved a recipe)
 *   - day 2 — value push (meal planner + shopping list)
 *   - day 3 — urgency push + email ("trial ends today")
 *
 * Targets users still inside the 3-day window who have NOT started any
 * subscription (no iap_subscriptions row). Idempotent via trial_nudge_log
 * (one row per user per nudge_key), so running twice daily never double-sends.
 *
 * Off by default: until TRIAL_NUDGES_ENABLED === "true" it computes and returns
 * the plan WITHOUT sending or logging (dry run), so the copy + targeting can be
 * reviewed in cron output before any real user is messaged.
 */

import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { sendPushToUsers, type PushPayload } from "@/lib/push/send";
import { sendTrialEndingEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

export const maxDuration = 120;

const HOUR = 60 * 60 * 1000;
// Bucket boundaries (hours since signup). The cron runs twice daily, so these
// overlap the run cadence enough that every user is caught once per bucket.
const DAY1 = { key: "day1", from: 20 * HOUR, to: 44 * HOUR };
const DAY2 = { key: "day2", from: 44 * HOUR, to: 60 * HOUR };
const DAY3 = { key: "day3", from: 60 * HOUR, to: 72 * HOUR };

const PUSH: Record<string, PushPayload> = {
  day1_activate: {
    eventType: "trial_nudge",
    title: "Your premium trial is live",
    body: "Save your first recipe — paste any link or snap a photo, and galleybook does the rest.",
    data: { screen: "new_recipe" },
  },
  day1_reinforce: {
    eventType: "trial_nudge",
    title: "That recipe's safe forever",
    body: "Nice start. Add the rest of your collection while premium's on the house.",
    data: { screen: "library" },
  },
  day2: {
    eventType: "trial_nudge",
    title: "Plan the week in a tap",
    body: "Turn your saved recipes into a meal plan and an auto shopping list. Try it before your trial ends.",
    data: { screen: "cook_next" },
  },
  day3: {
    eventType: "trial_nudge",
    title: "Your free trial ends today",
    body: "Keep every recipe, the planner and your shopping list for €1.99/month.",
    data: { screen: "library" },
  },
};

type Candidate = { id: string; email: string; ageMs: number };

export async function GET(request: Request) {
  const isCron =
    request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) {
    const guard = await requireAdminApi();
    if ("response" in guard) return guard.response;
  }

  const enabled = process.env.TRIAL_NUDGES_ENABLED === "true";
  const service = createServiceClient();
  const now = Date.now();

  try {
    // Candidates: signed up inside the 3-day trial window (with a little slack
    // on the young end so we don't nudge someone minutes after signup).
    const windowStart = new Date(now - DAY3.to).toISOString();
    const windowEnd = new Date(now - DAY1.from).toISOString();
    const { data: users, error: usersErr } = await service
      .from("users")
      .select("id, email, created_at")
      .gte("created_at", windowStart)
      .lte("created_at", windowEnd);
    if (usersErr) throw new Error(`users query: ${usersErr.message}`);

    const candidateIds = (users ?? []).map((u) => u.id);
    if (candidateIds.length === 0) {
      return NextResponse.json({ enabled, candidates: 0, plan: {}, results: {} });
    }

    // Exclude anyone who already started a subscription (paid, StoreKit trial,
    // comp, offer code — any iap_subscriptions row means they've converted past
    // "needs a nudge").
    const [{ data: subs }, { data: sent }, { data: recipes }] = await Promise.all([
      service.from("iap_subscriptions").select("user_id").in("user_id", candidateIds),
      service.from("trial_nudge_log").select("user_id, nudge_key").in("user_id", candidateIds),
      service
        .from("recipes")
        .select("created_by")
        .in("created_by", candidateIds)
        .is("deleted_at", null),
    ]);

    const excluded = new Set((subs ?? []).map((s) => s.user_id));
    const alreadySent = new Set((sent ?? []).map((r) => `${r.user_id}:${r.nudge_key}`));
    const activated = new Set((recipes ?? []).map((r) => r.created_by).filter(Boolean));

    // Bucket each eligible candidate into at most one nudge.
    const groups: Record<string, Candidate[]> = {
      day1_activate: [],
      day1_reinforce: [],
      day2: [],
      day3: [],
    };
    for (const u of users ?? []) {
      if (excluded.has(u.id)) continue;
      const ageMs = now - new Date(u.created_at).getTime();
      const bucket =
        ageMs >= DAY1.from && ageMs < DAY1.to ? DAY1
        : ageMs >= DAY2.from && ageMs < DAY2.to ? DAY2
        : ageMs >= DAY3.from && ageMs < DAY3.to ? DAY3
        : null;
      if (!bucket) continue;
      if (alreadySent.has(`${u.id}:${bucket.key}`)) continue;
      const cand: Candidate = { id: u.id, email: u.email, ageMs };
      if (bucket.key === "day1") {
        groups[activated.has(u.id) ? "day1_reinforce" : "day1_activate"].push(cand);
      } else {
        groups[bucket.key].push(cand);
      }
    }

    const plan = Object.fromEntries(
      Object.entries(groups).map(([k, v]) => [k, v.length]),
    );

    if (!enabled) {
      // Dry run: report what WOULD send, touch nothing.
      logger.info("trial_nudges.dry_run", { plan });
      return NextResponse.json({ enabled: false, dryRun: true, candidates: candidateIds.length, plan });
    }

    // Send. Push for every group; email additionally for day3.
    const results: Record<string, unknown> = {};
    const toLog: { user_id: string; nudge_key: string }[] = [];

    for (const [group, members] of Object.entries(groups)) {
      if (members.length === 0) continue;
      const ids = members.map((m) => m.id);
      const push = await sendPushToUsers(ids, PUSH[group]);
      results[group] = push;
      const nudgeKey = group.startsWith("day1") ? "day1" : group;
      members.forEach((m) => toLog.push({ user_id: m.id, nudge_key: nudgeKey }));
    }

    // Day-3 email (highest-value touch; reaches users with no push token too).
    let emailsSent = 0;
    for (const m of groups.day3) {
      if (!m.email) continue;
      try {
        await sendTrialEndingEmail({ toEmail: m.email });
        emailsSent += 1;
      } catch (e) {
        logger.error("trial_nudges.email_failed", {
          userId: m.id,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
    results.day3_emails = emailsSent;

    // Log every attempted nudge so the next run skips it (insert-once).
    if (toLog.length > 0) {
      const { error: logErr } = await service
        .from("trial_nudge_log")
        .upsert(toLog, { onConflict: "user_id,nudge_key", ignoreDuplicates: true });
      if (logErr) logger.error("trial_nudges.log_failed", { message: logErr.message });
    }

    logger.info("trial_nudges.sent", { plan, results });
    return NextResponse.json({ enabled: true, candidates: candidateIds.length, plan, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("trial_nudges.cron_failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
