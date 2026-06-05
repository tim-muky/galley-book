/**
 * Auto-pause guardrail (GAL-427) — bounded autonomy for the daily pipeline.
 *
 * Runs in the daily cron AFTER analysis. Auto-pauses clear-loser creatives
 * (CPS over a threshold past a spend/impression floor, so we don't act on
 * noise); everything borderline stays a recommendation only. Nothing is
 * auto-scaled or auto-budgeted in v1.
 *
 * SAFETY: actions only execute when GROWTH_AUTOPAUSE_ENABLED === "true". By
 * default the engine runs in DRY-RUN — it evaluates, logs, and reports what it
 * *would* pause (executed=false) without touching live ads. Flip the env once
 * you trust the calls. That env is the global kill-switch.
 */

import { pauseAd, type AdInsightRow } from "./meta-ads";
import { logger } from "@/lib/logger";

export interface AutoPauseConfig {
  /** DB-truth CPS above which a creative is a clear loser. */
  thresholdCps: number;
  /** Minimum spend before we'll act (noise floor). */
  minSpend: number;
  /** Minimum impressions before we'll act (noise floor). */
  minImpressions: number;
  /** Global kill-switch. False ⇒ dry-run (evaluate + report, never pause). */
  enabled: boolean;
}

export function getAutoPauseConfig(): AutoPauseConfig {
  return {
    thresholdCps: Number(process.env.GROWTH_AUTOPAUSE_CPS ?? 8),
    minSpend: Number(process.env.GROWTH_AUTOPAUSE_MIN_SPEND ?? 10),
    minImpressions: Number(process.env.GROWTH_AUTOPAUSE_MIN_IMPRESSIONS ?? 1000),
    enabled: process.env.GROWTH_AUTOPAUSE_ENABLED === "true",
  };
}

export interface AutoAction {
  adId: string;
  adName: string;
  action: "paused";
  /** false ⇒ dry-run: would have paused, but the kill-switch is off. */
  executed: boolean;
  reason: string;
  metric: {
    spend: number;
    newUsers: number;
    cps: number | null; // DB-truth: spend ÷ DB-attributed new users
    impressions: number;
  };
}

type Creative = AdInsightRow & { newUsers: number };

/** DB-truth CPS for a creative — null when there are no attributed signups. */
function dbCps(c: Creative): number | null {
  return c.newUsers > 0 ? c.spend / c.newUsers : null;
}

/**
 * Decide + (optionally) execute auto-pauses for the day's creatives.
 * Returns the actions taken/proposed, for logging + the email + the dashboard.
 */
export async function runAutoPause(
  perCreative: Creative[],
  config: AutoPauseConfig = getAutoPauseConfig(),
): Promise<AutoAction[]> {
  const actions: AutoAction[] = [];

  for (const c of perCreative) {
    // Noise floor — never act below it.
    if (c.spend < config.minSpend || c.impressions < config.minImpressions) continue;

    const cps = dbCps(c);
    // Clear loser: spent past the floor with zero signups, OR CPS over threshold.
    const breaches = c.newUsers === 0 || (cps != null && cps > config.thresholdCps);
    if (!breaches) continue;

    const reason =
      c.newUsers === 0
        ? `€${c.spend.toFixed(2)} spent over ${c.impressions.toLocaleString("en-US")} impressions with 0 signups (floor: €${config.minSpend}/${config.minImpressions} impr).`
        : `CPS €${cps!.toFixed(2)} > €${config.thresholdCps} threshold on €${c.spend.toFixed(2)} spend.`;

    let executed = false;
    if (config.enabled) {
      try {
        await pauseAd(c.adId);
        executed = true;
        logger.info("growth.autopause.executed", { adId: c.adId, adName: c.adName, reason });
      } catch (e) {
        logger.error("growth.autopause.pause_failed", { adId: c.adId, message: String(e) });
        // Record as proposed (executed=false) so it still surfaces for manual action.
      }
    } else {
      logger.info("growth.autopause.dry_run", { adId: c.adId, adName: c.adName, reason });
    }

    actions.push({
      adId: c.adId,
      adName: c.adName,
      action: "paused",
      executed,
      reason,
      metric: { spend: c.spend, newUsers: c.newUsers, cps, impressions: c.impressions },
    });
  }

  return actions;
}
