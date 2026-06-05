import { createServiceClient } from "@/lib/supabase/service";
import type { DailyMetrics, GrowthAnalysis } from "@/lib/marketing/growth";
import Link from "next/link";

/**
 * Daily Report view (GAL-429) — renders the same content as the daily email
 * (GAL-428) from the stored growth_daily_reports rows, with a date-chip history
 * picker (?report=YYYY-MM-DD) so prior days + the AI's prior calls are reviewable.
 *
 * Forward-deps omitted until built: installs/24h (GAL-424), auto-pause actions
 * (GAL-427), recommendation outcomes (GAL-430).
 */

const BASE = "/admin/campaign-studio/dashboard";

const eur = (n: number | null | undefined) => (n == null ? "—" : `€${n.toFixed(2)}`);
const pct = (n: number | null | undefined) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);

interface ReportRow {
  report_date: string;
  generated_at: string;
  metrics: DailyMetrics;
  analysis: GrowthAnalysis | null;
}

export async function DailyReportSection({ selectedDate }: { selectedDate?: string }) {
  const service = createServiceClient();

  // History (date + newUsers total) for the picker + trend sparkline. Cap at 30.
  const { data: history } = await service
    .from("growth_daily_reports")
    .select("report_date, metrics")
    .order("report_date", { ascending: false })
    .limit(30);

  if (!history || history.length === 0) {
    return (
      <section className="mb-10">
        <Heading />
        <div className="bg-surface-low rounded-md p-4">
          <p className="text-xs font-light text-on-surface-variant">
            No daily reports yet — the first lands after the 06:00 UTC cron run.
          </p>
        </div>
      </section>
    );
  }

  const dates = history.map((h) => h.report_date as string);
  const active = selectedDate && dates.includes(selectedDate) ? selectedDate : dates[0];

  const { data: report } = await service
    .from("growth_daily_reports")
    .select("report_date, generated_at, metrics, analysis")
    .eq("report_date", active)
    .single<ReportRow>();

  if (!report) {
    return (
      <section className="mb-10">
        <Heading />
        <div className="bg-surface-low rounded-md p-4">
          <p className="text-xs font-light text-on-surface-variant">Report not found.</p>
        </div>
      </section>
    );
  }

  const { metrics, analysis } = report;
  const { newUsers, paid, kpis, last7d } = metrics;
  const ch = newUsers.byChannel;

  // Trend: new users per report, oldest→newest (history is desc).
  const trend = [...history]
    .reverse()
    .map((h) => (h.metrics as DailyMetrics)?.newUsers?.total ?? 0);

  return (
    <section className="mb-10">
      <Heading />

      {/* Date-chip history picker */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {dates.map((d) => {
          const isActive = d === active;
          return (
            <Link
              key={d}
              href={`${BASE}?report=${d}`}
              scroll={false}
              className="shrink-0 border rounded-full px-3 py-1.5 text-xs font-light"
              style={
                isActive
                  ? { backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }
                  : { backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }
              }
            >
              {d.slice(5)}
            </Link>
          );
        })}
      </div>

      {/* Headline + channel split */}
      <div className="bg-white rounded-md p-4 shadow-ambient mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-1">
          {active} · new users
        </p>
        <p className="text-4xl font-thin text-anthracite leading-none">{newUsers.total}</p>
        <p className="text-xs font-light text-on-surface-variant mt-2">
          {ch.paid} paid · {ch.organic} organic · {ch.direct} direct
        </p>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <Tile label="Spend" value={eur(paid.spend)} />
        <Tile label="CPS (paid)" value={eur(kpis.cpsPaid)} />
        <Tile label="Blended CPS" value={eur(kpis.blendedCps)} />
        <Tile label="Impressions" value={paid.impressions.toLocaleString("en-US")} />
        <Tile label="CTR" value={pct(paid.ctr)} />
        <Tile label="CPC" value={eur(paid.cpc)} />
      </div>

      {/* New-users trend */}
      <div className="bg-white rounded-md p-4 shadow-ambient mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
          New users · last {trend.length} report{trend.length === 1 ? "" : "s"}
        </p>
        <Sparkline values={trend} />
      </div>

      {/* Per-creative table */}
      {metrics.perCreative.length > 0 && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
            Per creative · best→worst CPS
          </p>
          <div className="flex flex-col gap-2 mb-3">
            {metrics.perCreative.map((c) => (
              <div key={c.adId} className="bg-white rounded-md p-3 shadow-ambient flex items-center justify-between gap-3">
                <span className="text-sm font-light text-anthracite truncate">{c.adName || c.adId}</span>
                <span className="text-xs font-light text-on-surface-variant shrink-0">
                  {eur(c.spend)} · {c.newUsers} signups · {eur(c.costPerSignup)} CPS
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 7-day roll-up */}
      <p className="text-xs font-light text-on-surface-variant mb-4">
        Last 7 days — {last7d.newUsers} new users · {eur(last7d.spend)} spend
      </p>

      {/* AI narrative */}
      {analysis ? (
        <div className="bg-white rounded-md p-4 shadow-ambient">
          <p className="text-sm font-light text-anthracite leading-relaxed mb-4">{analysis.summary}</p>

          <NarrativeList title="What's working" items={analysis.drivers} />
          <NarrativeList title="Underperforming" items={analysis.underperformers} />

          {analysis.recommendations.length > 0 && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-4 mb-2">
                Recommendations
              </p>
              <div className="flex flex-col gap-3">
                {analysis.recommendations.map((r, i) => (
                  <div key={i}>
                    <p className="text-sm font-semibold text-anthracite">
                      {r.action}
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant ml-2">
                        {r.confidence}
                      </span>
                    </p>
                    <p className="text-xs font-light text-on-surface-variant mt-0.5">{r.rationale}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          <p className="text-[11px] font-light italic text-on-surface-variant/70 mt-4">
            {analysis.dataQuality}
          </p>
        </div>
      ) : (
        <div className="bg-surface-low rounded-md p-4">
          <p className="text-xs font-light text-on-surface-variant">AI analysis unavailable for this run.</p>
        </div>
      )}
    </section>
  );
}

function Heading() {
  return (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
        Daily report
      </p>
    </>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-md p-4 shadow-ambient">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-1">{label}</p>
      <p className="text-2xl font-thin text-anthracite">{value}</p>
    </div>
  );
}

function NarrativeList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-3 mb-1.5">
        {title}
      </p>
      <ul className="list-disc pl-4 flex flex-col gap-1">
        {items.map((it, i) => (
          <li key={i} className="text-xs font-light text-on-surface-variant leading-relaxed">
            {it}
          </li>
        ))}
      </ul>
    </>
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
            title={`${v} new user${v === 1 ? "" : "s"}`}
          />
        </div>
      ))}
    </div>
  );
}
