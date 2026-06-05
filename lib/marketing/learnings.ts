/**
 * Learnings KB (GAL-430, parts 2 + 3).
 *
 * Derives evidence-backed, recency-weighted insights from the daily reports by
 * joining each report's per-creative performance to its structured attributes
 * (creative_attributes). Recomputed each run, so learnings are reinforced or
 * retired as data accrues — the "reinforce/retire" loop, kept deliberately
 * simple (heuristic stats + recency half-life), not a bandit (see GAL-430 note).
 *
 * getTopLearnings() feeds the strongest learnings back into generation
 * (ad-copy) and the daily AI analysis, closing the loop.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

/** Recency half-life in days — a 14-day-old report counts for half. */
const HALF_LIFE_DAYS = 14;
/** Dimensions we learn over, mapped to the creative_attributes column. */
const DIMENSIONS = ["angle", "theme", "hook_type", "media_format"] as const;
type Dimension = (typeof DIMENSIONS)[number];

export interface Learning {
  id: string;
  dimension: string;
  value: string;
  statement: string;
  evidence: Record<string, unknown>;
  sampleSize: number;
  confidence: "low" | "medium" | "high";
  status: string;
}

interface CreativePerf {
  adId: string;
  spend: number;
  impressions: number;
  clicks: number;
  newUsers: number;
}

interface Bucket {
  wSpend: number;
  wImpr: number;
  wClicks: number;
  wSignups: number;
  rawSignups: number;
  firstDate: string;
  lastDate: string;
}

function confidenceFor(rawSignups: number): Learning["confidence"] {
  if (rawSignups >= 10) return "high";
  if (rawSignups >= 3) return "medium";
  return "low";
}

function eur(n: number | null): string {
  return n == null ? "—" : `€${n.toFixed(2)}`;
}

/**
 * Recompute the learnings KB from all stored reports. Returns the number of
 * active learnings written. Buckets with no support this run are retired.
 */
export async function deriveLearnings(): Promise<number> {
  const service = createServiceClient();

  const [{ data: reports, error: rErr }, { data: attrs, error: aErr }] = await Promise.all([
    service.from("growth_daily_reports").select("report_date, per_creative"),
    service.from("creative_attributes").select("*"),
  ]);
  if (rErr || aErr) {
    logger.error("growth.learnings.fetch_failed", { message: rErr?.message ?? aErr?.message });
    return 0;
  }

  const attrByAd = new Map<string, Record<string, string | null>>();
  for (const a of attrs ?? []) attrByAd.set(a.ad_id as string, a as Record<string, string | null>);

  // dimension → value → bucket
  const buckets = new Map<Dimension, Map<string, Bucket>>();
  for (const d of DIMENSIONS) buckets.set(d, new Map());

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (const r of reports ?? []) {
    const date = r.report_date as string;
    const ageDays = Math.max(0, (today.getTime() - new Date(date).getTime()) / 86_400_000);
    const weight = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    const perCreative = (r.per_creative as CreativePerf[] | null) ?? [];

    for (const c of perCreative) {
      const attr = attrByAd.get(c.adId);
      if (!attr) continue; // untagged creative — can't attribute to a dimension
      for (const dim of DIMENSIONS) {
        const value = attr[dim];
        if (!value) continue;
        const m = buckets.get(dim)!;
        const b =
          m.get(value) ??
          { wSpend: 0, wImpr: 0, wClicks: 0, wSignups: 0, rawSignups: 0, firstDate: date, lastDate: date };
        b.wSpend += c.spend * weight;
        b.wImpr += c.impressions * weight;
        b.wClicks += c.clicks * weight;
        b.wSignups += c.newUsers * weight;
        b.rawSignups += c.newUsers;
        if (date < b.firstDate) b.firstDate = date;
        if (date > b.lastDate) b.lastDate = date;
        m.set(value, b);
      }
    }
  }

  // Build learning rows. Within each dimension, rank by CPS (lower = better)
  // among values that have at least one weighted signup.
  const rows: {
    dimension: string;
    value: string;
    statement: string;
    evidence: Record<string, unknown>;
    sample_size: number;
    confidence: string;
    status: string;
    first_observed: string;
    last_updated: string;
  }[] = [];
  const nowIso = new Date().toISOString();

  for (const dim of DIMENSIONS) {
    const m = buckets.get(dim)!;
    const entries = [...m.entries()].map(([value, b]) => {
      const cps = b.wSignups > 0 ? b.wSpend / b.wSignups : null;
      const ctr = b.wImpr > 0 ? b.wClicks / b.wImpr : null;
      return { value, b, cps, ctr };
    });
    const ranked = entries
      .filter((e) => e.cps != null)
      .sort((a, b) => (a.cps as number) - (b.cps as number));
    const bestValue = ranked[0]?.value;

    for (const e of entries) {
      const { value, b, cps, ctr } = e;
      const isBest = value === bestValue && cps != null && ranked.length > 1;
      const ctrPct = ctr != null ? `${(ctr * 100).toFixed(1)}% CTR` : "no CTR yet";
      const statement =
        b.rawSignups === 0
          ? `${value} (${dim}): ${eur(b.wSpend)} spent, ${ctrPct}, 0 signups so far.`
          : `${value} (${dim}): ${eur(cps)} CPS, ${ctrPct} over ${b.rawSignups} signups${
              isBest ? ` — best ${dim} by CPS` : ""
            }.`;
      rows.push({
        dimension: dim,
        value,
        statement,
        evidence: {
          weightedSpend: Number(b.wSpend.toFixed(2)),
          weightedSignups: Number(b.wSignups.toFixed(2)),
          cps: cps != null ? Number(cps.toFixed(2)) : null,
          ctr: ctr != null ? Number(ctr.toFixed(4)) : null,
          rawSignups: b.rawSignups,
          isBestInDimension: isBest,
        },
        sample_size: b.rawSignups,
        confidence: confidenceFor(b.rawSignups),
        status: "active",
        first_observed: b.firstDate,
        last_updated: nowIso,
      });
    }
  }

  // Retire any existing learning whose (dimension,value) no longer has support.
  const present = new Set(rows.map((r) => `${r.dimension}|${r.value}`));
  const { data: existing } = await service
    .from("growth_learnings")
    .select("dimension, value, status");
  const toRetire = (existing ?? [])
    .filter((e) => e.status === "active" && !present.has(`${e.dimension}|${e.value}`))
    .map((e) => ({ dimension: e.dimension as string, value: e.value as string }));

  if (rows.length > 0) {
    const { error } = await service
      .from("growth_learnings")
      .upsert(rows, { onConflict: "dimension,value" });
    if (error) {
      logger.error("growth.learnings.upsert_failed", { message: error.message });
      return 0;
    }
  }
  for (const r of toRetire) {
    await service
      .from("growth_learnings")
      .update({ status: "retired", last_updated: nowIso })
      .eq("dimension", r.dimension)
      .eq("value", r.value);
  }

  logger.info("growth.learnings.derived", { active: rows.length, retired: toRetire.length });
  return rows.length;
}

/**
 * The strongest active learnings, for feeding generation + the daily analysis.
 * Ranked by confidence, then sample size, then recency.
 */
export async function getTopLearnings(limit = 6): Promise<Learning[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("growth_learnings")
    .select("*")
    .eq("status", "active");
  if (error || !data) {
    if (error) logger.error("growth.learnings.top_failed", { message: error.message });
    return [];
  }
  const rank = { high: 3, medium: 2, low: 1 } as const;
  return (data as Record<string, unknown>[])
    .map((r) => ({
      id: r.id as string,
      dimension: r.dimension as string,
      value: r.value as string,
      statement: r.statement as string,
      evidence: (r.evidence as Record<string, unknown>) ?? {},
      sampleSize: (r.sample_size as number) ?? 0,
      confidence: (r.confidence as Learning["confidence"]) ?? "low",
      status: r.status as string,
    }))
    .sort(
      (a, b) =>
        rank[b.confidence] - rank[a.confidence] || b.sampleSize - a.sampleSize,
    )
    .slice(0, limit);
}
