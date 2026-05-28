/**
 * Meta Marketing API (GAL-391) — push ad creatives into the standing Advantage+
 * campaign (GAL-54), control budget/state, and read insights for the dashboard.
 *
 * Auth: the System User token (ads_management) directly — NOT the page token.
 * Everything that creates spend-capable objects is created **PAUSED**; budget
 * and unpausing are explicit, separate actions.
 *
 * API surface verified against Graph v25 docs (object_story_spec + link_data,
 * /insights breakdowns, daily_budget in minor units/cents).
 */

import { logger } from "@/lib/logger";
import { META, adAccountPath } from "./meta-config";

const GRAPH = "https://graph.facebook.com/v25.0";

interface MetaErrorEnvelope {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    error_user_title?: string;
    error_user_msg?: string;
    fbtrace_id?: string;
  };
}

export class MetaAdsError extends Error {
  readonly code?: number;
  readonly subcode?: number;
  constructor(message: string, e?: MetaErrorEnvelope["error"]) {
    super(message);
    this.name = "MetaAdsError";
    this.code = e?.code;
    this.subcode = e?.error_subcode;
  }
}

function token(): string {
  const t = process.env.META_SYSTEM_USER_TOKEN;
  if (!t) throw new MetaAdsError("META_SYSTEM_USER_TOKEN not set");
  return t;
}

async function call<T>(
  path: string,
  method: "GET" | "POST",
  params: Record<string, string>,
): Promise<T> {
  const body = new URLSearchParams({ ...params, access_token: token() });
  const url = method === "GET" ? `${GRAPH}/${path}?${body}` : `${GRAPH}/${path}`;
  const res = await fetch(url, method === "GET" ? { method } : { method, body });
  const json = (await res.json().catch(() => ({}))) as T & MetaErrorEnvelope;
  if (!res.ok || (json as MetaErrorEnvelope).error) {
    const e = (json as MetaErrorEnvelope).error;
    // Prefer Meta's human-readable user message — the generic `message` is
    // often just "Invalid parameter" while error_user_msg names the real cause.
    const msg = e?.error_user_msg ?? e?.message ?? `Marketing API ${res.status} on ${path}`;
    throw new MetaAdsError(msg, e);
  }
  return json as T;
}

// ---- Push ad creative (PAUSED) --------------------------------------------

export interface PushAdCreativeInput {
  /** Public image URL (e.g. a carousel cover slide or ad-variant image) */
  imageUrl: string;
  /** Ad copy */
  headline: string;
  primaryText: string;
  /** Destination — the UTM-tagged galley deep link */
  linkUrl: string;
  /** Human-readable ad name in Ads Manager */
  name: string;
}

export interface PushAdCreativeResult {
  creativeId: string;
  adId: string;
}

/**
 * Create an ad creative + a PAUSED ad in the standing ad set. Nothing delivers
 * until the campaign/ad are explicitly resumed.
 */
export async function pushAdCreative(input: PushAdCreativeInput): Promise<PushAdCreativeResult> {
  const objectStorySpec = {
    page_id: META.pageId,
    link_data: {
      picture: input.imageUrl,
      link: input.linkUrl,
      message: input.primaryText,
      name: input.headline,
      call_to_action: { type: "SIGN_UP", value: { link: input.linkUrl } },
    },
  };

  const creative = await call<{ id: string }>(`${adAccountPath}/adcreatives`, "POST", {
    name: `${input.name} — creative`,
    object_story_spec: JSON.stringify(objectStorySpec),
  });

  const ad = await call<{ id: string }>(`${adAccountPath}/ads`, "POST", {
    name: input.name,
    adset_id: META.adSetId,
    creative: JSON.stringify({ creative_id: creative.id }),
    status: "PAUSED",
  });

  logger.info("campaign_studio.ads.creative_pushed", {
    creativeId: creative.id,
    adId: ad.id,
  });
  return { creativeId: creative.id, adId: ad.id };
}

// ---- Budget (weekly target → daily push) ----------------------------------

/** Set the campaign daily budget. `euros` is the human amount; Meta wants cents. */
export async function setDailyBudget(euros: number, campaignId = META.campaignId): Promise<void> {
  const cents = Math.round(euros * 100);
  if (cents < 100) throw new MetaAdsError("Daily budget must be at least €1");
  await call(`${campaignId}`, "POST", { daily_budget: String(cents) });
  logger.info("campaign_studio.ads.budget_set", { campaignId, euros });
}

/** Weekly target → daily push (Meta has no native weekly budget). */
export async function setWeeklyBudget(weeklyEuros: number, campaignId = META.campaignId): Promise<void> {
  await setDailyBudget(weeklyEuros / 7, campaignId);
}

// ---- Pause / resume -------------------------------------------------------

export async function pauseCampaign(campaignId = META.campaignId): Promise<void> {
  await call(`${campaignId}`, "POST", { status: "PAUSED" });
  logger.info("campaign_studio.ads.paused", { campaignId });
}

export async function resumeCampaign(campaignId = META.campaignId): Promise<void> {
  await call(`${campaignId}`, "POST", { status: "ACTIVE" });
  logger.info("campaign_studio.ads.resumed", { campaignId });
}

// ---- Insights -------------------------------------------------------------

export type InsightsBreakdown = "age" | "gender" | "publisher_platform" | "country" | "region";

interface RawInsightRow {
  impressions?: string;
  clicks?: string;
  spend?: string;
  actions?: { action_type: string; value: string }[];
  cost_per_action_type?: { action_type: string; value: string }[];
  // breakdown dimensions appear as extra keys (age, gender, publisher_platform, …)
  [k: string]: unknown;
}

export interface InsightRow {
  impressions: number;
  clicks: number;
  spend: number;
  /** signups attributed (complete_registration action) */
  signups: number;
  /** cost per signup, or null if no signups yet */
  costPerSignup: number | null;
  /** present when a breakdown was requested */
  breakdown?: Record<string, string>;
}

const SIGNUP_ACTION = "complete_registration";

function parseRow(r: RawInsightRow, breakdowns: InsightsBreakdown[]): InsightRow {
  const signups = Number(r.actions?.find((a) => a.action_type === SIGNUP_ACTION)?.value ?? 0);
  const cps = r.cost_per_action_type?.find((a) => a.action_type === SIGNUP_ACTION)?.value;
  const row: InsightRow = {
    impressions: Number(r.impressions ?? 0),
    clicks: Number(r.clicks ?? 0),
    spend: Number(r.spend ?? 0),
    signups,
    costPerSignup: cps != null ? Number(cps) : signups > 0 ? Number(r.spend ?? 0) / signups : null,
  };
  if (breakdowns.length) {
    row.breakdown = Object.fromEntries(
      breakdowns.map((b) => [b, String(r[b] ?? "")]),
    );
  }
  return row;
}

export interface GetInsightsOptions {
  /** Meta date_preset, e.g. "last_7d", "last_30d". Defaults to last_7d. */
  datePreset?: string;
  /** Up to the breakdowns Meta allows to combine (e.g. ["age","gender"]). */
  breakdowns?: InsightsBreakdown[];
  campaignId?: string;
}

/**
 * Campaign insights — totals or broken down by audience dimension.
 * Returns [] when the campaign has no delivery yet.
 */
export async function getInsights({
  datePreset = "last_7d",
  breakdowns = [],
  campaignId = META.campaignId,
}: GetInsightsOptions = {}): Promise<InsightRow[]> {
  const params: Record<string, string> = {
    fields: "impressions,clicks,spend,actions,cost_per_action_type",
    date_preset: datePreset,
    level: "campaign",
  };
  if (breakdowns.length) params.breakdowns = breakdowns.join(",");

  const data = await call<{ data?: RawInsightRow[] }>(
    `${campaignId}/insights`,
    "GET",
    params,
  );
  return (data.data ?? []).map((r) => parseRow(r, breakdowns));
}
