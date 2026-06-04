/**
 * Growth Intelligence (GAL-422) — daily metrics collection + AI analysis.
 *
 * Primary acquisition metric is a **new row in public.users** (created on
 * Google/Apple sign-in) — real-time, all-platform, UTM-attributed — NOT store
 * installs (which lag and are ~0 until the apps are public). See GAL-422.
 *
 * collectDailyMetrics() pulls yesterday's (and 7d) numbers from Meta + Supabase;
 * analyzeGrowth() turns them into a narrative + ranked recommendations (Gemini).
 */

import { generateObject } from "ai";
import { z } from "zod";
import { getInsights, getAdInsights, type AdInsightRow } from "./meta-ads";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

const ANALYSIS_MODEL = "google/gemini-3.5-flash";

export type Channel = "paid" | "organic" | "direct";

/**
 * Classify a signup's first-touch UTM into a channel. Pragmatic, not exhaustive:
 * paid Meta ads tag `utm_medium=paid_social` (see meta-push route); link-in-bio
 * is organic; no UTM is direct.
 */
export function classifyChannel(
  utmSource?: string | null,
  utmMedium?: string | null,
): Channel {
  const s = (utmSource ?? "").toLowerCase();
  const m = (utmMedium ?? "").toLowerCase();
  if (!s && !m) return "direct";
  if (["paid", "cpc", "ppc", "ads", "ad"].some((x) => m.includes(x))) return "paid";
  if (s === "meta" || s === "facebook" || s === "fb") {
    return m.includes("organic") || m.includes("bio") || m.includes("profile")
      ? "organic"
      : "paid";
  }
  if (
    s === "instagram" ||
    s === "ig" ||
    m.includes("bio") ||
    m.includes("organic") ||
    m.includes("social")
  ) {
    return "organic";
  }
  return "direct";
}

/** Full UTC day window for `daysAgo` days ago (1 = yesterday). */
function dayWindowUTC(daysAgo = 1): { date: string; startISO: string; endISO: string } {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0); // today 00:00 UTC
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - daysAgo);
  const date = start.toISOString().slice(0, 10);
  return { date, startISO: start.toISOString(), endISO: end.toISOString() };
}

interface UserAttrRow {
  utm_source: string | null;
  utm_medium: string | null;
  utm_content: string | null;
}

async function fetchNewUsers(
  service: ReturnType<typeof createServiceClient>,
  startISO: string,
  endISO: string,
) {
  const { data, error } = await service
    .from("users")
    .select("utm_source, utm_medium, utm_content")
    .gte("created_at", startISO)
    .lt("created_at", endISO);
  if (error) throw new Error(`fetchNewUsers: ${error.message}`);

  const rows = (data ?? []) as UserAttrRow[];
  const byChannel: Record<Channel, number> = { paid: 0, organic: 0, direct: 0 };
  const byCreative: Record<string, number> = {};
  for (const r of rows) {
    byChannel[classifyChannel(r.utm_source, r.utm_medium)] += 1;
    if (r.utm_content) byCreative[r.utm_content] = (byCreative[r.utm_content] ?? 0) + 1;
  }
  return { total: rows.length, byChannel, byCreative };
}

function ratio(n: number, d: number): number | null {
  return d > 0 ? n / d : null;
}

/**
 * Map Meta adId → utm_content from the stored push records, so per-ad insights
 * can be joined to DB-attributed new users (GAL-431). Ads pushed before utm_content
 * tagging simply won't have a mapping (→ 0 attributed), which is correct.
 */
async function fetchAdContentMap(
  service: ReturnType<typeof createServiceClient>,
): Promise<Record<string, string>> {
  const { data, error } = await service
    .from("galley_distributions")
    .select("meta_creative_ids")
    .eq("meta_status", "pushed");
  if (error) {
    logger.error("growth.ad_content_map_failed", { message: error.message });
    return {};
  }
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    const ids = (row.meta_creative_ids as { adId?: string; utmContent?: string }[] | null) ?? [];
    for (const r of ids) {
      if (r.adId && r.utmContent) map[r.adId] = r.utmContent;
    }
  }
  return map;
}

export interface DailyMetrics {
  window: { date: string; startISO: string; endISO: string };
  paid: {
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number | null;
    cpc: number | null;
    metaSignups: number; // pixel-attributed, for comparison vs DB truth
  };
  newUsers: {
    total: number;
    byChannel: Record<Channel, number>;
    byCreative: Record<string, number>; // utm_content → count
  };
  kpis: {
    cpsPaid: number | null; // spend ÷ paid-attributed new users (DB truth)
    blendedCps: number | null; // spend ÷ all new users
  };
  perCreative: (AdInsightRow & { newUsers: number })[];
  last7d: { spend: number; metaSignups: number; newUsers: number };
}

/** Pull yesterday's full picture (paid Meta + new users) + a 7d roll-up. */
export async function collectDailyMetrics(): Promise<DailyMetrics> {
  const service = createServiceClient();
  const window = dayWindowUTC(1);
  const window7 = dayWindowUTC(7);

  // Meta is resilient to [] (no delivery yet) → totals null → zeros.
  const [totalsArr, perCreativeRaw, totals7Arr, newUsers, newUsers7, adContentMap] =
    await Promise.all([
      getInsights({ datePreset: "yesterday" }).catch((e) => {
        logger.error("growth.meta.totals_failed", { message: String(e) });
        return [];
      }),
      getAdInsights({ datePreset: "yesterday" }).catch((e) => {
        logger.error("growth.meta.percreative_failed", { message: String(e) });
        return [];
      }),
      getInsights({ datePreset: "last_7d" }).catch(() => []),
      fetchNewUsers(service, window.startISO, window.endISO),
      fetchNewUsers(service, window7.startISO, window7.endISO),
      fetchAdContentMap(service),
    ]);

  const totals = totalsArr[0] ?? { spend: 0, impressions: 0, clicks: 0, signups: 0 };
  const totals7 = totals7Arr[0] ?? { spend: 0, signups: 0 };

  // Per-creative: attach DB-attributed new users by joining adId → utm_content
  // → signup count (GAL-431). Ads without a utm_content mapping resolve to 0.
  const perCreative = perCreativeRaw
    .map((ad) => ({ ...ad, newUsers: newUsers.byCreative[adContentMap[ad.adId]] ?? 0 }))
    .sort((a, b) => (a.costPerSignup ?? Infinity) - (b.costPerSignup ?? Infinity));

  return {
    window,
    paid: {
      spend: totals.spend,
      impressions: totals.impressions,
      clicks: totals.clicks,
      ctr: ratio(totals.clicks, totals.impressions),
      cpc: ratio(totals.spend, totals.clicks),
      metaSignups: totals.signups,
    },
    newUsers,
    kpis: {
      cpsPaid: ratio(totals.spend, newUsers.byChannel.paid),
      blendedCps: ratio(totals.spend, newUsers.total),
    },
    perCreative,
    last7d: { spend: totals7.spend, metaSignups: totals7.signups, newUsers: newUsers7.total },
  };
}

// ---- AI analysis (GAL-426) -------------------------------------------------

export const GrowthAnalysisSchema = z.object({
  summary: z
    .string()
    .describe("2-4 sentence plain-language read on how the ads performed yesterday."),
  drivers: z
    .array(z.string())
    .describe("What's driving engagement/signups, each tied to a metric. [] if no data."),
  underperformers: z
    .array(z.string())
    .describe("What's underperforming or wasting spend, each tied to a metric. [] if none."),
  recommendations: z
    .array(
      z.object({
        action: z.string().describe("Concrete action, e.g. 'Pause ad X', 'Scale Y', 'Test angle Z'"),
        rationale: z.string().describe("The stat that justifies it"),
        confidence: z.enum(["low", "medium", "high"]),
      }),
    )
    .describe("Ranked, stat-backed recommendations. Few/none when data is thin."),
  dataQuality: z
    .string()
    .describe("One line on data sufficiency, e.g. 'Thin: <100 impressions, treat as noise.'"),
});

export type GrowthAnalysis = z.infer<typeof GrowthAnalysisSchema>;

/** Turn the day's metrics into a narrative + ranked recommendations (Gemini). */
export async function analyzeGrowth(metrics: DailyMetrics): Promise<GrowthAnalysis> {
  const { object } = await generateObject({
    model: ANALYSIS_MODEL,
    schema: GrowthAnalysisSchema,
    system: [
      "You are a senior performance-marketing analyst for galleybook, a recipe app in a German softlaunch.",
      "Primary success metric: NET-NEW USERS in the database (a real signup), not impressions or clicks.",
      "Cost-per-signup (CPS) = ad spend ÷ paid-attributed new users. The go/no-go gate is CPS ≤ €5 (≤ €8 acceptable early).",
      "Ad angles: 'problem' (pain-point hook) vs 'hero' (appetite hook). Note which performs better when data allows.",
      "Be ruthless about thin data: with low spend/impressions, say so and DO NOT over-react to noise — prefer 'keep observing' over premature pauses.",
      "Recommendations must be concrete and each cite the specific metric that justifies it.",
    ].join(" "),
    prompt: [
      "Yesterday's metrics (JSON):",
      JSON.stringify(metrics, null, 2),
      "",
      "Write the daily analysis. If there were no new users and no/low spend yet (e.g. ads still in review), say that plainly and keep recommendations minimal.",
    ].join("\n"),
  });
  return object;
}

// ---- Persist ---------------------------------------------------------------

/** Collect + analyze + upsert one daily report. Returns the stored row shape. */
export async function generateAndStoreDailyReport(): Promise<{
  reportDate: string;
  metrics: DailyMetrics;
  analysis: GrowthAnalysis | null;
}> {
  const metrics = await collectDailyMetrics();

  let analysis: GrowthAnalysis | null = null;
  try {
    analysis = await analyzeGrowth(metrics);
  } catch (e) {
    // Never let analysis failure drop the metrics snapshot.
    logger.error("growth.analysis_failed", { message: String(e) });
  }

  const service = createServiceClient();
  const { error } = await service.from("growth_daily_reports").upsert(
    {
      report_date: metrics.window.date,
      generated_at: new Date().toISOString(),
      metrics,
      per_creative: metrics.perCreative,
      analysis,
    },
    { onConflict: "report_date" },
  );
  if (error) throw new Error(`store daily report: ${error.message}`);

  logger.info("growth.daily_report_stored", {
    reportDate: metrics.window.date,
    newUsers: metrics.newUsers.total,
    spend: metrics.paid.spend,
    hasAnalysis: analysis != null,
  });

  return { reportDate: metrics.window.date, metrics, analysis };
}
