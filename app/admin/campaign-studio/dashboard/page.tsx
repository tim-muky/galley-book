import { requireAdmin } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { getInsights, getAdInsights, type InsightRow, type AdInsightRow } from "@/lib/marketing/meta-ads";
import { AdsControls } from "./ads-controls";
import { CreativeControls } from "./creative-controls";
import Link from "next/link";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const ORGANIC = "__organic__";

interface FunnelRow {
  key: string;
  source: string | null;
  campaign: string | null;
  signups: number;
  signups7d: number;
  premium: number;
}

export default async function DashboardPage() {
  await requireAdmin();
  const service = createServiceClient();

  // Prototype scale (≈20 users) — fetch + aggregate in JS rather than an RPC.
  const [{ data: users }, { data: subs }] = await Promise.all([
    service.from("users").select("id, utm_source, utm_campaign, created_at"),
    service
      .from("iap_subscriptions")
      .select("user_id")
      .eq("status", "active")
      .is("revoked_at", null),
  ]);

  // Premium = own active, non-revoked sub. (Galley-shared / premium-invite
  // resolution is user-level at read time; own-sub is the dominant signal at
  // this scale — see entitlement model. Invite-based premium excluded for now.)
  const premiumUserIds = new Set((subs ?? []).map((s) => s.user_id));

  // Dynamic server component — runs once per request, not re-rendered.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const rows = new Map<string, FunnelRow>();
  // Signups per day for the last 7 days (index 6 = today) — sparkline trend.
  const daily = new Array<number>(7).fill(0);
  let totalSignups = 0;
  let totalPremium = 0;

  for (const u of users ?? []) {
    const source = (u.utm_source as string | null) ?? null;
    const campaign = (u.utm_campaign as string | null) ?? null;
    const key = source || campaign ? `${source ?? ""}|${campaign ?? ""}` : ORGANIC;

    let row = rows.get(key);
    if (!row) {
      row = { key, source, campaign, signups: 0, signups7d: 0, premium: 0 };
      rows.set(key, row);
    }
    row.signups++;
    if (u.created_at) {
      const ageMs = now - new Date(u.created_at as string).getTime();
      if (ageMs <= WEEK_MS) {
        row.signups7d++;
        const dayIndex = 6 - Math.floor(ageMs / DAY_MS);
        if (dayIndex >= 0 && dayIndex <= 6) daily[dayIndex]++;
      }
    }
    const isPremium = premiumUserIds.has(u.id);
    if (isPremium) row.premium++;

    totalSignups++;
    if (isPremium) totalPremium++;
  }

  const sorted = [...rows.values()].sort((a, b) => b.signups - a.signups);
  const overallConv = totalSignups ? Math.round((totalPremium / totalSignups) * 100) : 0;

  // Paid metrics (GAL-391) — best-effort; the campaign may be paused / no delivery.
  let paidTotals: InsightRow | null = null;
  let paidByAudience: InsightRow[] = [];
  let paidByCreative: AdInsightRow[] = [];
  let paidError: string | null = null;
  try {
    const [totals, byAudience, byCreative] = await Promise.all([
      getInsights({ datePreset: "last_7d" }),
      getInsights({ datePreset: "last_7d", breakdowns: ["age", "gender"] }),
      getAdInsights({ datePreset: "last_7d" }),
    ]);
    paidTotals = totals[0] ?? null;
    paidByAudience = byAudience;
    // Cheapest signups first; ads with no signups sink to the bottom.
    paidByCreative = byCreative.sort(
      (a, b) => (a.costPerSignup ?? Infinity) - (b.costPerSignup ?? Infinity),
    );
  } catch (e) {
    paidError = e instanceof Error ? e.message : "Insights unavailable";
  }

  return (
    <div>
      <Link href="/admin/campaign-studio" className="text-xs font-light text-on-surface-variant">
        ← Studio
      </Link>
      <h1 className="text-4xl font-thin text-anthracite mt-1 mb-1">Attribution</h1>
      <p className="text-xs font-light text-on-surface-variant mb-6">
        Signups → premium by source · first-touch UTM
      </p>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <Stat label="Signups" value={totalSignups} />
        <Stat label="Premium" value={totalPremium} />
        <Stat label="Conversion" value={`${overallConv}%`} />
      </div>

      {/* 7-day signups trend */}
      <div className="bg-white rounded-md p-4 shadow-ambient mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
          Signups · last 7 days
        </p>
        <Sparkline values={daily} />
      </div>

      {/* Per-source funnel */}
      <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
        By source / campaign
      </p>
      <div className="flex flex-col gap-2 mb-8">
        {sorted.length === 0 && (
          <div className="bg-white rounded-md p-4 shadow-ambient text-xs font-light text-on-surface-variant">
            No signups yet.
          </div>
        )}
        {sorted.map((r) => {
          const conv = r.signups ? Math.round((r.premium / r.signups) * 100) : 0;
          const isOrganic = r.key === ORGANIC;
          return (
            <div key={r.key} className="bg-white rounded-md p-4 shadow-ambient">
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-sm font-light text-anthracite">
                  {isOrganic ? "Organic / direct" : r.source ?? "—"}
                  {!isOrganic && r.campaign && (
                    <span className="text-on-surface-variant"> · {r.campaign}</span>
                  )}
                </p>
                <p className="text-xs font-light text-on-surface-variant">{conv}% conv</p>
              </div>
              <div className="flex gap-6">
                <Metric label="Signups" value={r.signups} />
                <Metric label="7-day" value={r.signups7d} />
                <Metric label="Premium" value={r.premium} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Paid metrics (GAL-391) */}
      <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
        Paid · last 7 days
      </p>

      <div className="mb-3">
        <AdsControls />
      </div>

      {paidError ? (
        <div className="bg-surface-low rounded-md p-4 mb-3">
          <p className="text-xs font-light text-on-surface-variant">
            Insights unavailable: {paidError}
          </p>
        </div>
      ) : paidTotals && paidTotals.impressions > 0 ? (
        <>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <Stat label="Spend" value={`€${paidTotals.spend.toFixed(2)}`} />
            <Stat label="Signups" value={paidTotals.signups} />
            <Stat
              label="Cost / signup"
              value={paidTotals.costPerSignup != null ? `€${paidTotals.costPerSignup.toFixed(2)}` : "—"}
            />
          </div>
          <div className="flex flex-col gap-2 mb-3">
            <div className="bg-white rounded-md p-4 shadow-ambient flex gap-6">
              <Metric label="Impressions" value={paidTotals.impressions} />
              <Metric label="Clicks" value={paidTotals.clicks} />
            </div>
          </div>

          {paidByCreative.length > 0 && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
                By creative · cheapest signups first
              </p>
              <div className="flex flex-col gap-2 mb-3">
                {paidByCreative.map((r) => (
                  <div key={r.adId} className="bg-white rounded-md p-3 shadow-ambient">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="text-sm font-light text-anthracite truncate">{r.adName || r.adId}</span>
                      <CreativeControls adId={r.adId} />
                    </div>
                    <div className="flex gap-5">
                      <Metric label="Spend" value={r.spend} euro />
                      <Metric label="Clicks" value={r.clicks} />
                      <Metric label="Signups" value={r.signups} />
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
                          Cost / signup
                        </p>
                        <p className="text-lg font-light text-anthracite">
                          {r.costPerSignup != null ? `€${r.costPerSignup.toFixed(2)}` : "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {paidByAudience.length > 0 && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
                By audience (age · gender)
              </p>
              <div className="flex flex-col gap-2 mb-3">
                {paidByAudience.map((r, i) => (
                  <div key={i} className="bg-white rounded-md p-3 shadow-ambient flex items-center justify-between">
                    <span className="text-sm font-light text-anthracite">
                      {r.breakdown?.age} · {r.breakdown?.gender}
                    </span>
                    <span className="text-xs font-light text-on-surface-variant">
                      €{r.spend.toFixed(2)} · {r.signups} signups ·{" "}
                      {r.costPerSignup != null ? `€${r.costPerSignup.toFixed(2)}/signup` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="bg-surface-low rounded-md p-4">
          <p className="text-xs font-light text-on-surface-variant">
            No delivery yet — the campaign is paused or hasn&apos;t spent. Set a budget and launch
            above; metrics + audience breakdowns appear here once it delivers.
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white rounded-md p-4 shadow-ambient">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-1">
        {label}
      </p>
      <p className="text-3xl font-thin text-anthracite">{value}</p>
    </div>
  );
}

function Metric({ label, value, euro }: { label: string; value: number; euro?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
        {label}
      </p>
      <p className="text-lg font-light text-anthracite">{euro ? `€${value.toFixed(2)}` : value}</p>
    </div>
  );
}

/** Minimal inline bar sparkline — no chart lib (prototype scale). */
function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-1.5 h-12">
      {values.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
          <div
            className="w-full bg-anthracite rounded-sm"
            style={{ height: `${Math.max(2, (v / max) * 100)}%` }}
            title={`${v} signup${v === 1 ? "" : "s"}`}
          />
        </div>
      ))}
    </div>
  );
}
