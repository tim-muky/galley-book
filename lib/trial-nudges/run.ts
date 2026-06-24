/**
 * Trial-nudge sequence — core run logic.
 *
 * Every new signup gets 3 days of full premium (lib/iap/entitlement.ts). This
 * fans out a short lifecycle sequence to convert trial → paid before the window
 * closes. Targets users still inside the 3-day window who have NOT started any
 * subscription (no iap_subscriptions row). Idempotent via trial_nudge_log (one
 * row per user per nudge_key), so re-running never double-sends.
 *
 * GAL-469: redesigned for a ONCE-DAILY cadence. Vercel Hobby has no spare cron
 * slot, so this is invoked from the daily growth-report cron rather than a
 * dedicated twice-daily one (see app/api/cron/growth-daily-report). Two touches,
 * each on a window wide enough that a single daily run — tolerant of Vercel cron
 * jitter — always catches the user once:
 *   - "early"  (18–54h) — activation push (or a reinforce push if they already
 *                         saved a recipe)
 *   - "ending" (48–76h) — urgency push + email ("trial ending soon")
 * In the 48–54h overlap the ending touch wins. Copy is localized DE/EN.
 *
 * Gated by the caller's `enabled` flag (TRIAL_NUDGES_ENABLED): when false this
 * computes and returns the plan WITHOUT sending or logging (dry run), so
 * targeting + copy can be reviewed in cron output before any real user is
 * messaged.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { sendPushToUsers, type PushPayload } from "@/lib/push/send";
import { sendTrialEndingEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

const HOUR = 60 * 60 * 1000;
// Windows in ms-since-signup. Each spans >24h (+ jitter slack) so a single
// daily run always lands inside it once.
const EARLY = { from: 18 * HOUR, to: 54 * HOUR };
const ENDING = { from: 48 * HOUR, to: 76 * HOUR };

type Lang = "de" | "en";
type Touch = "early_activate" | "early_reinforce" | "ending";
type Candidate = { id: string; email: string; lang: Lang };

/** Markets are DE/AT (German) + IE/DK (English); everything else falls back to EN. */
function resolveLang(preferred: string | null | undefined): Lang {
  return (preferred ?? "").toLowerCase().startsWith("de") ? "de" : "en";
}

/** The idempotency key a touch logs under (early_* collapse to one "early"). */
function logKeyFor(touch: Touch): "early" | "ending" {
  return touch === "ending" ? "ending" : "early";
}

const PUSH: Record<Touch, Record<Lang, PushPayload>> = {
  early_activate: {
    en: {
      eventType: "trial_nudge",
      title: "Your premium trial is live",
      body: "Save your first recipe — paste any link or snap a photo, and galleybook does the rest.",
      data: { screen: "new_recipe" },
    },
    de: {
      eventType: "trial_nudge",
      title: "Dein Premium-Test ist aktiv",
      body: "Speichere dein erstes Rezept — Link einfügen oder Foto machen, galleybook erledigt den Rest.",
      data: { screen: "new_recipe" },
    },
  },
  early_reinforce: {
    en: {
      eventType: "trial_nudge",
      title: "That recipe's safe forever",
      body: "Nice start. Add the rest of your collection while premium's on the house.",
      data: { screen: "library" },
    },
    de: {
      eventType: "trial_nudge",
      title: "Dieses Rezept bleibt für immer",
      body: "Guter Start! Füll deine Sammlung auf, solange Premium gratis läuft.",
      data: { screen: "library" },
    },
  },
  ending: {
    en: {
      eventType: "trial_nudge",
      title: "Your free trial is ending soon",
      body: "Keep every recipe, the meal planner and your shopping list for €1.99/month.",
      data: { screen: "library" },
    },
    de: {
      eventType: "trial_nudge",
      title: "Dein Gratis-Test endet bald",
      body: "Behalte alle Rezepte, den Wochenplan und die Einkaufsliste für 1,99 €/Monat.",
      data: { screen: "library" },
    },
  },
};

export type TrialNudgeResult = {
  enabled: boolean;
  dryRun: boolean;
  candidates: number;
  plan: Record<Touch, number>;
  results?: Record<string, unknown>;
};

export async function runTrialNudges({
  enabled,
}: {
  enabled: boolean;
}): Promise<TrialNudgeResult> {
  const service = createServiceClient();
  const now = Date.now();
  const emptyPlan: Record<Touch, number> = {
    early_activate: 0,
    early_reinforce: 0,
    ending: 0,
  };

  // Candidates: signed up inside the touch windows (with slack on the young end
  // so we never nudge someone minutes after signup).
  const windowStart = new Date(now - ENDING.to).toISOString();
  const windowEnd = new Date(now - EARLY.from).toISOString();
  const { data: users, error: usersErr } = await service
    .from("users")
    .select("id, email, created_at, preferred_language")
    .gte("created_at", windowStart)
    .lte("created_at", windowEnd);
  if (usersErr) throw new Error(`users query: ${usersErr.message}`);

  const candidateIds = (users ?? []).map((u) => u.id);
  if (candidateIds.length === 0) {
    return { enabled, dryRun: !enabled, candidates: 0, plan: emptyPlan };
  }

  // Exclude anyone who already started any subscription (paid, StoreKit trial,
  // comp, offer code), anyone already nudged for that key, and read who has
  // activated (saved a recipe) to pick the right day-1 message.
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

  // Bucket each eligible candidate into at most one touch this run. The ending
  // touch wins in the 48–54h overlap.
  const groups: Record<Touch, Candidate[]> = {
    early_activate: [],
    early_reinforce: [],
    ending: [],
  };
  for (const u of users ?? []) {
    if (excluded.has(u.id)) continue;
    const age = now - new Date(u.created_at).getTime();
    const cand: Candidate = {
      id: u.id,
      email: u.email,
      lang: resolveLang(u.preferred_language),
    };
    if (age >= ENDING.from && age < ENDING.to && !alreadySent.has(`${u.id}:ending`)) {
      groups.ending.push(cand);
    } else if (
      age >= EARLY.from &&
      age < EARLY.to &&
      !alreadySent.has(`${u.id}:early`)
    ) {
      groups[activated.has(u.id) ? "early_reinforce" : "early_activate"].push(cand);
    }
  }

  const plan: Record<Touch, number> = {
    early_activate: groups.early_activate.length,
    early_reinforce: groups.early_reinforce.length,
    ending: groups.ending.length,
  };

  if (!enabled) {
    // Dry run: report what WOULD send, touch nothing.
    logger.info("trial_nudges.dry_run", { plan });
    return { enabled: false, dryRun: true, candidates: candidateIds.length, plan };
  }

  // Send. Push per (touch, language); email additionally for the ending touch.
  const results: Record<string, unknown> = {};
  const toLog: { user_id: string; nudge_key: string }[] = [];
  const langs: Lang[] = ["de", "en"];

  for (const touch of Object.keys(groups) as Touch[]) {
    const members = groups[touch];
    if (members.length === 0) continue;
    for (const lang of langs) {
      const ids = members.filter((m) => m.lang === lang).map((m) => m.id);
      if (ids.length === 0) continue;
      results[`${touch}:${lang}`] = await sendPushToUsers(ids, PUSH[touch][lang]);
    }
    const key = logKeyFor(touch);
    members.forEach((m) => toLog.push({ user_id: m.id, nudge_key: key }));
  }

  // Ending email (highest-value touch; reaches users with no push token too).
  let emailsSent = 0;
  for (const m of groups.ending) {
    if (!m.email) continue;
    try {
      await sendTrialEndingEmail({ toEmail: m.email, lang: m.lang });
      emailsSent += 1;
    } catch (e) {
      logger.error("trial_nudges.email_failed", {
        userId: m.id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  results.ending_emails = emailsSent;

  // Log every attempted touch so the next run skips it (insert-once).
  if (toLog.length > 0) {
    const { error: logErr } = await service
      .from("trial_nudge_log")
      .upsert(toLog, { onConflict: "user_id,nudge_key", ignoreDuplicates: true });
    if (logErr) logger.error("trial_nudges.log_failed", { message: logErr.message });
  }

  logger.info("trial_nudges.sent", { plan, results });
  return { enabled: true, dryRun: false, candidates: candidateIds.length, plan, results };
}
