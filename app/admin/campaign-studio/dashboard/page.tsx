import { requireAdmin } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { getInsights, type InsightRow } from "@/lib/marketing/meta-ads";
import { AdsControls } from "./ads-controls";
import Link from "next/link";

export const dynamic = "force-dynamic";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
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
    if (u.created_at && now - new Date(u.created_at as string).getTime() <= WEEK_MS) {
      row.signups7d++;
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
  let paidError: string | null = null;
  try {
    const [totals, byAudience] = await Promise.all([
      getInsights({ datePreset: "last_7d" }),
      getInsights({ datePreset: "last_7d", breakdowns: ["age", "gender"] }),
    ]);
    paidTotals = totals[0] ?? null;
    paidByAudience = byAudience;
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
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat label="Signups" value={totalSignups} />
        <Stat label="Premium" value={totalPremium} />
        <Stat label="Conversion" value={`${overallConv}%`} />
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

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
        {label}
      </p>
      <p className="text-lg font-light text-anthracite">{value}</p>
    </div>
  );
}
