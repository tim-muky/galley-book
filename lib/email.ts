import { Resend } from "resend";
import { fetchPreviousMetrics, type DailyMetrics, type GrowthAnalysis } from "@/lib/marketing/growth";
import type { AutoAction } from "@/lib/marketing/autopause";

const FROM = "galleybook <contact@galleybook.com>";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}
export async function sendGalleyInvite({
  inviterName,
  galleyName,
  inviteUrl,
  toEmail,
}: {
  inviterName: string;
  galleyName: string;
  inviteUrl: string;
  toEmail: string;
}) {
  await getResend().emails.send({
    from: FROM,
    to: toEmail,
    replyTo: "contact@galleybook.com",
    subject: `${inviterName} invited you to ${galleyName}`,
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; color: #252729;">
        <p style="font-size: 1.75rem; font-weight: 300; margin-bottom: 1rem;">You've been invited.</p>
        <p style="font-size: 0.875rem; font-weight: 300; line-height: 1.6; color: #474747;">
          <strong style="font-weight: 600;">${inviterName}</strong> invited you to join
          <strong style="font-weight: 600;">${galleyName}</strong> on galleybook —
          a private recipe library for the people you cook for.
        </p>
        <a href="${inviteUrl}"
           style="display: inline-block; margin-top: 1.5rem; padding: 0.75rem 1.5rem;
                  background: #252729; color: #fff; border-radius: 9999px;
                  font-size: 0.875rem; font-weight: 300; text-decoration: none;">
          Accept invite
        </a>
        <p style="font-size: 0.75rem; font-weight: 300; color: #474747; margin-top: 2rem;">
          Or copy this link: ${inviteUrl}
        </p>
      </div>
    `,
  });
}

// ---- Trial-ending nudge (day 3 of the 3-day premium trial) ------------------

const APP_STORE_URL = "https://apps.apple.com/app/id6764606059";

export async function sendTrialEndingEmail({ toEmail }: { toEmail: string }) {
  await getResend().emails.send({
    from: FROM,
    to: toEmail,
    replyTo: "contact@galleybook.com",
    subject: "Your galleybook trial ends today",
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; color: #252729;">
        <p style="font-size: 1.75rem; font-weight: 300; margin-bottom: 1rem;">Your free trial ends today.</p>
        <p style="font-size: 0.875rem; font-weight: 300; line-height: 1.6; color: #474747;">
          We hope galleybook earned a place in your kitchen. Keep every recipe
          you've saved — plus the meal planner and your auto shopping list — for
          <strong style="font-weight: 600;">€1.99/month</strong>. One subscription
          covers iOS, Android and the web.
        </p>
        <a href="${APP_STORE_URL}"
           style="display: inline-block; margin-top: 1.5rem; padding: 0.75rem 1.5rem;
                  background: #252729; color: #fff; border-radius: 9999px;
                  font-size: 0.875rem; font-weight: 300; text-decoration: none;">
          Keep my premium
        </a>
        <p style="font-size: 0.75rem; font-weight: 300; color: #474747; margin-top: 2rem;">
          Nothing happens automatically — your recipes stay saved either way. This
          just keeps premium features on.
        </p>
      </div>
    `,
  });
}

// ---- Growth daily report (GAL-428) -----------------------------------------

const eur = (n: number | null | undefined) =>
  n == null ? "—" : `€${n.toFixed(2)}`;
const pct = (n: number | null | undefined) =>
  n == null ? "—" : `${(n * 100).toFixed(1)}%`;
const num = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-US");

/** Day-over-day delta chip. `goodWhenUp` flips the sentiment colour (e.g. CPS is good when down). */
function delta(
  curr: number | null | undefined,
  prev: number | null | undefined,
  fmt: (n: number) => string,
  goodWhenUp = true,
): string {
  if (curr == null || prev == null || prev === curr) return "";
  const diff = curr - prev;
  const up = diff > 0;
  const good = up === goodWhenUp;
  const color = good ? "#2f7d4f" : "#b04646";
  return `<span style="font-size: 0.6875rem; font-weight: 400; color: ${color}; margin-left: 0.35rem;">${
    up ? "▲" : "▼"
  } ${fmt(Math.abs(diff))}</span>`;
}

function stat(label: string, value: string, deltaHtml = ""): string {
  return `
    <td style="padding: 0.5rem 1rem 0.5rem 0; vertical-align: top;">
      <div style="font-size: 0.625rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #474747;">${label}</div>
      <div style="font-size: 1.5rem; font-weight: 100; color: #252729; margin-top: 0.15rem;">${value}${deltaHtml}</div>
    </td>`;
}

function list(items: string[]): string {
  if (!items.length) return `<p style="font-size: 0.8125rem; font-weight: 300; color: #474747; margin: 0;">—</p>`;
  return `<ul style="margin: 0; padding-left: 1.1rem;">${items
    .map(
      (i) =>
        `<li style="font-size: 0.8125rem; font-weight: 300; line-height: 1.6; color: #474747; margin-bottom: 0.35rem;">${i}</li>`,
    )
    .join("")}</ul>`;
}

const CONF_COLOR: Record<string, string> = {
  high: "#252729",
  medium: "#474747",
  low: "#9a9a9a",
};

/** Per-creative table (best→worst by CPS), DB-attributed new users joined in. */
function creativeTable(perCreative: DailyMetrics["perCreative"]): string {
  if (!perCreative.length) return "";
  const th = (t: string, align = "left") =>
    `<th style="text-align: ${align}; font-size: 0.5625rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #9a9a9a; padding: 0 0.5rem 0.4rem 0;">${t}</th>`;
  const td = (t: string, align = "left") =>
    `<td style="text-align: ${align}; font-size: 0.75rem; font-weight: 300; color: #474747; padding: 0.3rem 0.5rem 0.3rem 0;">${t}</td>`;
  const rows = perCreative
    .map(
      (c) =>
        `<tr>${td(c.adName)}${td(eur(c.spend), "right")}${td(num(c.newUsers), "right")}${td(
          eur(c.costPerSignup),
          "right",
        )}</tr>`,
    )
    .join("");
  return `
      <p style="font-size: 0.625rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #474747; margin: 1.5rem 0 0.5rem;">Per creative (best→worst CPS)</p>
      <table style="border-collapse: collapse; width: 100%;">
        <tr>${th("Creative")}${th("Spend", "right")}${th("Signups", "right")}${th("CPS", "right")}</tr>
        ${rows}
      </table>`;
}

/** Organic IG engagement block — omitted entirely when there's no organic data. */
function organicBlock(organic: DailyMetrics["organic"]): string {
  const { account, totals } = organic;
  const hasData =
    account.reach != null ||
    account.profileViews != null ||
    account.websiteClicks != null ||
    totals.posts > 0;
  if (!hasData) return "";
  return `
      <p style="font-size: 0.625rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #474747; margin: 1.5rem 0 0.5rem;">Organic Instagram</p>
      <table style="border-collapse: collapse; width: 100%;">
        <tr>${stat("Reach", num(account.reach))}${stat("Profile visits", num(account.profileViews))}${stat(
          "Link taps",
          num(account.websiteClicks),
        )}</tr>
      </table>
      <p style="font-size: 0.75rem; font-weight: 300; color: #474747; margin: 0.5rem 0 0;">
        ${totals.posts} post${totals.posts === 1 ? "" : "s"} (7d) · ${num(totals.likes)} likes · ${num(
          totals.comments,
        )} comments${totals.saved != null ? ` · ${num(totals.saved)} saves` : ""}
      </p>`;
}

/** Auto-pause guardrail block (GAL-427) — omitted when there were no actions. */
function autoActionsBlock(actions: AutoAction[]): string {
  if (!actions.length) return "";
  const rows = actions
    .map((a) => {
      const tag = a.executed
        ? `<span style="color: #b04646; font-weight: 600;">Paused</span>`
        : `<span style="color: #9a7a2f; font-weight: 600;">Would pause (dry-run)</span>`;
      return `
      <div style="margin-bottom: 0.6rem;">
        <div style="font-size: 0.8125rem; font-weight: 600; color: #252729;">${a.adName || a.adId} — ${tag}</div>
        <div style="font-size: 0.8125rem; font-weight: 300; line-height: 1.5; color: #474747;">${a.reason}</div>
      </div>`;
    })
    .join("");
  return `
      <p style="font-size: 0.625rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #474747; margin: 1.5rem 0 0.5rem;">Auto-actions</p>
      ${rows}`;
}

/**
 * Render the daily growth report as a branded HTML email + plain-text fallback.
 * Mirrors the growth_daily_reports row shape (metrics + analysis + auto-actions),
 * plus optional previous-day metrics for day-over-day deltas.
 */
export function renderGrowthDailyReport({
  reportDate,
  metrics,
  analysis,
  autoActions = [],
  prev,
}: {
  reportDate: string;
  metrics: DailyMetrics;
  analysis: GrowthAnalysis | null;
  autoActions?: AutoAction[];
  prev?: DailyMetrics | null;
}): { subject: string; html: string; text: string } {
  const { newUsers, paid, kpis, last7d } = metrics;
  const ch = newUsers.byChannel;
  const p = prev ?? null;

  const subject = `galleybook growth — ${reportDate} · ${newUsers.total} new ${
    newUsers.total === 1 ? "user" : "users"
  }${kpis.blendedCps != null ? ` · ${eur(kpis.blendedCps)} CPS` : ""}`;

  const recs = (analysis?.recommendations ?? [])
    .map(
      (r) => `
      <div style="margin-bottom: 0.9rem;">
        <div style="font-size: 0.8125rem; font-weight: 600; color: #252729;">
          ${r.action}
          <span style="font-size: 0.625rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: ${
            CONF_COLOR[r.confidence] ?? "#474747"
          }; margin-left: 0.4rem;">${r.confidence}</span>
        </div>
        <div style="font-size: 0.8125rem; font-weight: 300; line-height: 1.5; color: #474747; margin-top: 0.15rem;">${r.rationale}</div>
      </div>`,
    )
    .join("");

  const html = `
    <div style="font-family: Inter, sans-serif; max-width: 560px; margin: 0 auto; color: #252729;">
      <p style="font-size: 0.625rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.12em; color: #474747; margin: 0;">Growth · ${reportDate}</p>
      <p style="font-size: 2.5rem; font-weight: 100; margin: 0.25rem 0 0.1rem;">${newUsers.total} new ${
        newUsers.total === 1 ? "user" : "users"
      }</p>
      <p style="font-size: 0.8125rem; font-weight: 300; color: #474747; margin: 0;">
        ${ch.paid} paid · ${ch.organic} organic · ${ch.direct} direct
      </p>

      <table style="margin-top: 1.5rem; border-collapse: collapse; width: 100%;">
        <tr>${stat("Spend", eur(paid.spend), delta(paid.spend, p?.paid.spend, eur))}${stat(
          "CPS (paid)",
          eur(kpis.cpsPaid),
          delta(kpis.cpsPaid, p?.kpis.cpsPaid, eur, false),
        )}${stat(
          "Blended CPS",
          eur(kpis.blendedCps),
          delta(kpis.blendedCps, p?.kpis.blendedCps, eur, false),
        )}</tr>
        <tr>${stat(
          "Impressions",
          num(paid.impressions),
          delta(paid.impressions, p?.paid.impressions, num),
        )}${stat("CTR", pct(paid.ctr), delta(paid.ctr, p?.paid.ctr, pct))}${stat(
          "CPC",
          eur(paid.cpc),
          delta(paid.cpc, p?.paid.cpc, eur, false),
        )}</tr>
      </table>

      ${creativeTable(metrics.perCreative)}

      ${organicBlock(metrics.organic)}

      ${autoActionsBlock(autoActions)}

      <p style="font-size: 0.75rem; font-weight: 300; color: #474747; margin: 1.25rem 0 0;">
        Last 7 days — ${last7d.newUsers} new users · ${eur(last7d.spend)} spend
      </p>

      ${
        analysis
          ? `
      <div style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid #F3F3F4;">
        <p style="font-size: 0.875rem; font-weight: 300; line-height: 1.6; color: #252729; margin: 0 0 1.5rem;">${analysis.summary}</p>

        <p style="font-size: 0.625rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #474747; margin: 0 0 0.5rem;">What's working</p>
        ${list(analysis.drivers)}

        <p style="font-size: 0.625rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #474747; margin: 1.25rem 0 0.5rem;">Underperforming</p>
        ${list(analysis.underperformers)}

        <p style="font-size: 0.625rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #474747; margin: 1.25rem 0 0.75rem;">Recommendations</p>
        ${recs || `<p style="font-size: 0.8125rem; font-weight: 300; color: #474747; margin: 0;">—</p>`}

        ${
          analysis.informedByLearnings?.length
            ? `<p style="font-size: 0.6875rem; font-weight: 300; color: #474747; margin: 1.25rem 0 0;"><strong style="font-weight: 600;">Informed by:</strong> ${analysis.informedByLearnings.join("; ")}</p>`
            : ""
        }
        <p style="font-size: 0.6875rem; font-weight: 300; font-style: italic; color: #9a9a9a; margin: 1.5rem 0 0;">${analysis.dataQuality}</p>
      </div>`
          : `<p style="font-size: 0.8125rem; font-weight: 300; color: #9a9a9a; margin-top: 2rem;">AI analysis unavailable for this run.</p>`
      }
    </div>`;

  const text = [
    `galleybook growth — ${reportDate}`,
    `${newUsers.total} new users (${ch.paid} paid · ${ch.organic} organic · ${ch.direct} direct)`,
    "",
    `Spend ${eur(paid.spend)} · CPS paid ${eur(kpis.cpsPaid)} · Blended CPS ${eur(kpis.blendedCps)}`,
    `Impressions ${num(paid.impressions)} · CTR ${pct(paid.ctr)} · CPC ${eur(paid.cpc)}`,
    `Last 7 days — ${last7d.newUsers} new users · ${eur(last7d.spend)} spend`,
    ...(metrics.perCreative.length
      ? [
          "",
          "Per creative (best→worst CPS):",
          ...metrics.perCreative.map(
            (c) =>
              `  - ${c.adName}: ${eur(c.spend)} spend · ${num(c.newUsers)} signups · ${eur(
                c.costPerSignup,
              )} CPS`,
          ),
        ]
      : []),
    ...(metrics.organic.account.reach != null ||
    metrics.organic.account.profileViews != null ||
    metrics.organic.account.websiteClicks != null ||
    metrics.organic.totals.posts > 0
      ? [
          "",
          "Organic Instagram:",
          `  Reach ${num(metrics.organic.account.reach)} · Profile visits ${num(
            metrics.organic.account.profileViews,
          )} · Link taps ${num(metrics.organic.account.websiteClicks)}`,
          `  ${metrics.organic.totals.posts} posts (7d) · ${num(metrics.organic.totals.likes)} likes · ${num(
            metrics.organic.totals.comments,
          )} comments${metrics.organic.totals.saved != null ? ` · ${num(metrics.organic.totals.saved)} saves` : ""}`,
        ]
      : []),
    ...(autoActions.length
      ? [
          "",
          "Auto-actions:",
          ...autoActions.map(
            (a) =>
              `  - ${a.adName || a.adId}: ${a.executed ? "PAUSED" : "would pause (dry-run)"} — ${a.reason}`,
          ),
        ]
      : []),
    ...(analysis
      ? [
          "",
          analysis.summary,
          ...(analysis.drivers.length ? ["", "What's working:", ...analysis.drivers.map((d) => `  - ${d}`)] : []),
          ...(analysis.underperformers.length
            ? ["", "Underperforming:", ...analysis.underperformers.map((u) => `  - ${u}`)]
            : []),
          ...(analysis.recommendations.length
            ? ["", "Recommendations:", ...analysis.recommendations.map((r) => `  - [${r.confidence}] ${r.action} — ${r.rationale}`)]
            : []),
          ...(analysis.informedByLearnings?.length
            ? ["", `Informed by: ${analysis.informedByLearnings.join("; ")}`]
            : []),
          "",
          analysis.dataQuality,
        ]
      : ["", "AI analysis unavailable for this run."]),
  ].join("\n");

  return { subject, html, text };
}

/** Send the daily growth report to the configured recipient(s). */
export async function sendGrowthDailyReport(report: {
  reportDate: string;
  metrics: DailyMetrics;
  analysis: GrowthAnalysis | null;
  autoActions?: AutoAction[];
}) {
  const to = (process.env.GROWTH_REPORT_TO ?? "tim@muky-kids.com")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  const prev = await fetchPreviousMetrics(report.reportDate);
  const { subject, html, text } = renderGrowthDailyReport({ ...report, prev });

  await getResend().emails.send({
    from: FROM,
    to,
    replyTo: "contact@galleybook.com",
    subject,
    html,
    text,
  });
}
