/**
 * Growth Intelligence (GAL-422 / GAL-483) — daily metrics collection + AI analysis.
 *
 * Primary acquisition metric is a **new row in public.users** (created on
 * Google/Apple sign-in) — real-time, all-platform, attributed. Reworked for the
 * GAL-463 pivot: Apple Search Ads-first (AT/DE base + IE/DK probe), Meta paused.
 * We now read the FULL funnel — landing visits → signups → activation → paid —
 * and treat ASA-attributed signups (users.asa_*) as the paid channel, by geo.
 *
 * collectDailyMetrics() pulls yesterday's (and 7d) numbers from Supabase (+ Meta,
 * kept but secondary); analyzeGrowth() turns them into a narrative + ranked
 * recommendations (Gemini).
 */

import { generateObject } from "ai";
import { z } from "zod";
import { getInsights, getAdInsights, type AdInsightRow } from "./meta-ads";
import { getOrganicIgInsights, type IgOrganicInsights } from "./instagram";
import { runAutoPause, type AutoAction } from "./autopause";
import { deriveLearnings, getTopLearnings, type Learning } from "./learnings";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { logAIUsage } from "@/lib/ai-logger";

const ANALYSIS_MODEL = "google/gemini-3.5-flash";

export type Channel = "asa" | "paid" | "organic" | "direct";

/**
 * Classify a NON-ASA signup's first-touch UTM into a channel. (ASA-attributed
 * users are bucketed as "asa" upstream via users.asa_attributed.) Pragmatic:
 * paid Meta ads tag `utm_medium=paid_social`; link-in-bio is organic; none = direct.
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
  asa_attributed: boolean | null;
  asa_country_or_region: string | null;
  asa_campaign_id: number | null;
}

export interface AsaBreakdown {
  signups: number;
  byGeo: Record<string, number>; // country/region → ad-attributed signups
  byCampaign: Record<string, number>; // asa_campaign_id → signups
}

async function fetchNewUsers(
  service: ReturnType<typeof createServiceClient>,
  startISO: string,
  endISO: string,
) {
  const { data, error } = await service
    .from("users")
    .select(
      "utm_source, utm_medium, utm_content, asa_attributed, asa_country_or_region, asa_campaign_id",
    )
    .gte("created_at", startISO)
    .lt("created_at", endISO);
  if (error) throw new Error(`fetchNewUsers: ${error.message}`);

  const rows = (data ?? []) as UserAttrRow[];
  const byChannel: Record<Channel, number> = { asa: 0, paid: 0, organic: 0, direct: 0 };
  const byCreative: Record<string, number> = {};
  const asa: AsaBreakdown = { signups: 0, byGeo: {}, byCampaign: {} };
  for (const r of rows) {
    if (r.asa_attributed) {
      byChannel.asa += 1;
      asa.signups += 1;
      const geo = r.asa_country_or_region ?? "??";
      asa.byGeo[geo] = (asa.byGeo[geo] ?? 0) + 1;
      if (r.asa_campaign_id != null) {
        const c = String(r.asa_campaign_id);
        asa.byCampaign[c] = (asa.byCampaign[c] ?? 0) + 1;
      }
    } else {
      byChannel[classifyChannel(r.utm_source, r.utm_medium)] += 1;
    }
    if (r.utm_content) byCreative[r.utm_content] = (byCreative[r.utm_content] ?? 0) + 1;
  }
  return { total: rows.length, byChannel, byCreative, asa };
}

export interface LandingMetrics {
  visits: number;
  sessions: number; // distinct ephemeral session ids
  byCountry: Record<string, number>;
  bySource: Record<string, number>; // referrer host, or "(direct)"
  topPaths: Record<string, number>;
}

/** First-party landing/site traffic for the window (GAL-483, page_views table). */
async function fetchLanding(
  service: ReturnType<typeof createServiceClient>,
  startISO: string,
  endISO: string,
): Promise<LandingMetrics> {
  const empty: LandingMetrics = { visits: 0, sessions: 0, byCountry: {}, bySource: {}, topPaths: {} };
  const { data, error } = await service
    .from("page_views")
    .select("path, referrer_host, country, session_id")
    .gte("created_at", startISO)
    .lt("created_at", endISO);
  if (error) {
    logger.error("growth.landing_failed", { message: error.message });
    return empty;
  }
  const rows = (data ?? []) as {
    path: string | null;
    referrer_host: string | null;
    country: string | null;
    session_id: string | null;
  }[];
  const sessions = new Set<string>();
  const byCountry: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const topPaths: Record<string, number> = {};
  for (const r of rows) {
    if (r.session_id) sessions.add(r.session_id);
    const c = r.country ?? "??";
    byCountry[c] = (byCountry[c] ?? 0) + 1;
    const src = r.referrer_host || "(direct)";
    bySource[src] = (bySource[src] ?? 0) + 1;
    const p = r.path ?? "/";
    topPaths[p] = (topPaths[p] ?? 0) + 1;
  }
  return { visits: rows.length, sessions: sessions.size, byCountry, bySource, topPaths };
}

export interface FunnelCohort {
  signups: number;
  activated: number; // ≥1 self-saved (non-seeded) recipe
  paying: number; // has an iap_subscriptions row
}

/**
 * Trailing 7-day signup-cohort conversion. Activation + paid take time, so they're
 * measured on the 7d cohort rather than yesterday's signups (which haven't had a
 * chance to convert). Activation = a first SELF-saved recipe (is_seeded=false).
 */
async function fetchFunnelCohort(
  service: ReturnType<typeof createServiceClient>,
  startISO: string,
  endISO: string,
): Promise<FunnelCohort> {
  const { data: users, error } = await service
    .from("users")
    .select("id")
    .gte("created_at", startISO)
    .lt("created_at", endISO);
  if (error) throw new Error(`fetchFunnelCohort: ${error.message}`);
  const ids = (users ?? []).map((u) => u.id as string);
  if (ids.length === 0) return { signups: 0, activated: 0, paying: 0 };

  const [{ data: recipes }, { data: subs }] = await Promise.all([
    service
      .from("recipes")
      .select("created_by")
      .in("created_by", ids)
      .eq("is_seeded", false)
      .is("deleted_at", null),
    service.from("iap_subscriptions").select("user_id").in("user_id", ids),
  ]);
  const activated = new Set((recipes ?? []).map((r) => r.created_by as string));
  const paying = new Set((subs ?? []).map((s) => s.user_id as string));
  return { signups: ids.length, activated: activated.size, paying: paying.size };
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
  /** Apple Search Ads (GAL-463) — ad-attributed signups by geo/campaign (yesterday). */
  asa: AsaBreakdown;
  /** First-party landing/site traffic (GAL-483, yesterday). */
  landing: LandingMetrics & { visitToSignup: number | null };
  /** Funnel: yesterday's flow + the trailing-7d cohort's conversion. */
  funnel: {
    visits: number; // yesterday
    signups: number; // yesterday
    cohort7d: FunnelCohort;
  };
  kpis: {
    cpsPaid: number | null; // spend ÷ paid-attributed new users (Meta only; ASA spend is manual)
    blendedCps: number | null; // spend ÷ all new users
  };
  perCreative: (AdInsightRow & { newUsers: number })[];
  /** Organic IG engagement for the window (GAL-425). */
  organic: IgOrganicInsights;
  last7d: { spend: number; metaSignups: number; newUsers: number };
}

/** Pull yesterday's full picture (funnel + ASA + landing + paid Meta) + a 7d roll-up. */
export async function collectDailyMetrics(): Promise<DailyMetrics> {
  const service = createServiceClient();
  const window = dayWindowUTC(1);
  const window7 = dayWindowUTC(7);

  // Meta is resilient to [] (no delivery yet) → totals null → zeros.
  const [
    totalsArr,
    perCreativeRaw,
    totals7Arr,
    newUsers,
    newUsers7,
    adContentMap,
    organic,
    landing,
    funnelCohort,
  ] = await Promise.all([
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
    // Already internally resilient (returns empty shape on failure).
    getOrganicIgInsights({ sinceDays: 7 }),
    fetchLanding(service, window.startISO, window.endISO),
    fetchFunnelCohort(service, window7.startISO, window7.endISO),
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
    newUsers: { total: newUsers.total, byChannel: newUsers.byChannel, byCreative: newUsers.byCreative },
    asa: newUsers.asa,
    landing: { ...landing, visitToSignup: ratio(newUsers.total, landing.visits) },
    funnel: { visits: landing.visits, signups: newUsers.total, cohort7d: funnelCohort },
    kpis: {
      cpsPaid: ratio(totals.spend, newUsers.byChannel.paid),
      blendedCps: ratio(totals.spend, newUsers.total),
    },
    perCreative,
    organic,
    last7d: { spend: totals7.spend, metaSignups: totals7.signups, newUsers: newUsers7.total },
  };
}

/** Most recent stored metrics strictly before `date` (for day-over-day deltas). */
export async function fetchPreviousMetrics(date: string): Promise<DailyMetrics | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("growth_daily_reports")
    .select("metrics")
    .lt("report_date", date)
    .order("report_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logger.error("growth.fetch_previous_failed", { message: error.message });
    return null;
  }
  return (data?.metrics as DailyMetrics | undefined) ?? null;
}

// ---- AI analysis (GAL-426) -------------------------------------------------

export const GrowthAnalysisSchema = z.object({
  summary: z
    .string()
    .describe("2-4 sentence plain-language read on yesterday: traffic, signups, channel/geo mix, funnel health."),
  drivers: z
    .array(z.string())
    .describe("What's driving signups/activation, each tied to a metric. [] if no data."),
  underperformers: z
    .array(z.string())
    .describe("Where the funnel is leaking or spend is wasted, each tied to a metric. [] if none."),
  recommendations: z
    .array(
      z.object({
        action: z.string().describe("Concrete action, e.g. 'Shift ASA budget to AT', 'Fix landing→signup drop', 'Test angle Z'"),
        rationale: z.string().describe("The stat that justifies it"),
        confidence: z.enum(["low", "medium", "high"]),
      }),
    )
    .describe("Ranked, stat-backed recommendations. Few/none when data is thin."),
  dataQuality: z
    .string()
    .describe("One line on data sufficiency, e.g. 'Thin: <50 visits, treat as noise.'"),
  informedByLearnings: z
    .array(z.string())
    .default([])
    .describe("Which of the provided learnings (verbatim or paraphrased) informed the recommendations. [] if none applied."),
});

export type GrowthAnalysis = z.infer<typeof GrowthAnalysisSchema>;

/** Turn the day's metrics into a narrative + ranked recommendations (Gemini). */
export async function analyzeGrowth(
  metrics: DailyMetrics,
  learnings: Learning[] = [],
): Promise<GrowthAnalysis> {
  const startedAt = Date.now();
  const { object, usage } = await generateObject({
    model: ANALYSIS_MODEL,
    schema: GrowthAnalysisSchema,
    system: [
      "You are a senior growth analyst for galleybook, a €1.99/mo recipe app in a German-first softlaunch.",
      "CURRENT STRATEGY: Apple Search Ads-first across a German base (Austria + Germany) plus a high-iOS English probe (Ireland + Denmark). Meta is PAUSED. The job is fixing the funnel and finding the cheapest-converting geo — NOT scaling spend.",
      "Read the FULL funnel, not one stage: landing visits → signups → activation (a first SELF-saved recipe; the 3 seeded demo recipes do NOT count) → trial → paid.",
      "Primary metric: NET-NEW SIGNUPS in the DB (real-time, all-platform) and their progression down the funnel. ASA-attributed signups (users.asa_*) are the paid channel — read them by geo and campaign; whichever geo converts cheapest is where budget should go.",
      "The go/no-go gate is blended cost-per-paying-subscriber ≤ €5. BUT ASA spend is entered manually in the weekly review, so do NOT compute or assume a daily cost-per-signup here — focus on signup volume, channel/geo mix, landing→signup rate, and activation/paid conversion.",
      "Be ruthless about thin data (this is low volume): say when numbers are too small to act on, and prefer 'keep observing' over premature conclusions.",
      "Recommendations must be concrete and each cite the specific metric that justifies it. Favour funnel/geo/activation insights; ignore Meta-creative tactics (Meta is paused) unless Meta data reappears.",
      "You are given prior LEARNINGS (recency-weighted, evidence-backed). Use them to inform recommendations, and list the ones you actually used in informedByLearnings.",
    ].join(" "),
    prompt: [
      "Yesterday's metrics (JSON):",
      JSON.stringify(metrics, null, 2),
      "",
      learnings.length
        ? `Prior learnings:\n${learnings.map((l) => `- ${l.statement} [${l.confidence}]`).join("\n")}`
        : "Prior learnings: none yet (KB still warming up).",
      "",
      "Write the daily analysis. If there were no visits/signups yet (e.g. ASA still in review), say that plainly and keep recommendations minimal.",
    ].join("\n"),
  });
  await logAIUsage({
    userId: null,
    operation: "campaign_growth_analysis",
    model: ANALYSIS_MODEL,
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    durationMs: Date.now() - startedAt,
    success: true,
  });
  return object;
}

// ---- Persist ---------------------------------------------------------------

/** Collect + analyze + auto-pause + upsert one daily report. Returns the stored row shape. */
export async function generateAndStoreDailyReport(): Promise<{
  reportDate: string;
  metrics: DailyMetrics;
  analysis: GrowthAnalysis | null;
  autoActions: AutoAction[];
}> {
  const metrics = await collectDailyMetrics();

  // Feed the strongest prior learnings into the analysis (GAL-430).
  const learnings = await getTopLearnings(6).catch(() => []);

  let analysis: GrowthAnalysis | null = null;
  try {
    analysis = await analyzeGrowth(metrics, learnings);
  } catch (e) {
    // Never let analysis failure drop the metrics snapshot.
    logger.error("growth.analysis_failed", { message: String(e) });
  }

  // Auto-pause guardrail (GAL-427) — runs after analysis; dry-run unless enabled.
  let autoActions: AutoAction[] = [];
  try {
    autoActions = await runAutoPause(metrics.perCreative);
  } catch (e) {
    // An auto-action failure must never drop the report.
    logger.error("growth.autopause_failed", { message: String(e) });
  }

  const service = createServiceClient();
  const { error } = await service.from("growth_daily_reports").upsert(
    {
      report_date: metrics.window.date,
      generated_at: new Date().toISOString(),
      metrics,
      per_creative: metrics.perCreative,
      analysis,
      auto_actions: autoActions,
    },
    { onConflict: "report_date" },
  );
  if (error) throw new Error(`store daily report: ${error.message}`);

  // Recompute the learnings KB now the day's report is stored, so it includes
  // today and reinforces/retires as data accrues (GAL-430). Best-effort.
  await deriveLearnings().catch((e) =>
    logger.error("growth.learnings_derive_failed", { message: String(e) }),
  );

  logger.info("growth.daily_report_stored", {
    reportDate: metrics.window.date,
    visits: metrics.landing.visits,
    newUsers: metrics.newUsers.total,
    asaSignups: metrics.asa.signups,
    hasAnalysis: analysis != null,
    autoActions: autoActions.length,
  });

  return { reportDate: metrics.window.date, metrics, analysis, autoActions };
}
