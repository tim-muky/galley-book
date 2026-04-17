import { createServiceClient } from "@/lib/supabase/service";

type AILog = {
  id: string;
  created_at: string;
  user_id: string | null;
  operation: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  duration_ms: number | null;
  success: boolean;
};

export default async function AICostPage() {
  const service = createServiceClient();

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [{ data: logsRaw }, { data: recentRaw }] = await Promise.all([
    service
      .from("ai_usage_logs")
      .select("id, created_at, operation, model, cost_usd, user_id")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: true }),
    service
      .from("ai_usage_logs")
      .select("id, created_at, user_id, operation, model, input_tokens, output_tokens, cost_usd, duration_ms, success")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const logs = (logsRaw ?? []) as unknown as AILog[];
  const recentLogs = (recentRaw ?? []) as unknown as AILog[];

  // Fetch user display names for the recent logs table
  const userIds = [...new Set(recentLogs.map((l) => l.user_id).filter(Boolean))] as string[];
  const { data: usersRaw } = userIds.length > 0
    ? await service.from("users").select("id, name, email").in("id", userIds)
    : { data: [] };
  const userMap = new Map(
    ((usersRaw ?? []) as { id: string; name: string | null; email: string }[]).map((u) => [
      u.id,
      u.name ?? u.email,
    ])
  );

  // Build 30-day chart buckets
  type DayCosts = { parse_link: number; parse_image: number; recommendation: number };
  const days: Record<string, DayCosts> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    days[d.toISOString().slice(0, 10)] = { parse_link: 0, parse_image: 0, recommendation: 0 };
  }
  for (const log of logs) {
    const day = log.created_at.slice(0, 10);
    if (day in days) {
      const op = log.operation as keyof DayCosts;
      if (op in days[day]) days[day][op] += log.cost_usd ?? 0;
    }
  }
  const chartDays = Object.entries(days);
  const maxDayCost = Math.max(
    ...chartDays.map(([, v]) => v.parse_link + v.parse_image + v.recommendation),
    0.000001
  );

  // Totals
  const monthLogs = logs.filter((l) => l.created_at >= monthStart);
  const costThisMonth = monthLogs.reduce((s, l) => s + (l.cost_usd ?? 0), 0);
  const callsThisMonth = monthLogs.length;
  const costAllTime = logs.reduce((s, l) => s + (l.cost_usd ?? 0), 0);
  const avgPerCall = callsThisMonth > 0 ? costThisMonth / callsThisMonth : 0;

  // Breakdown by operation and model (all 30 days)
  const byOp: Record<string, { cost: number; count: number }> = {};
  const byModel: Record<string, { cost: number; count: number }> = {};
  for (const log of logs) {
    if (!byOp[log.operation]) byOp[log.operation] = { cost: 0, count: 0 };
    byOp[log.operation].cost += log.cost_usd ?? 0;
    byOp[log.operation].count++;

    if (!byModel[log.model]) byModel[log.model] = { cost: 0, count: 0 };
    byModel[log.model].cost += log.cost_usd ?? 0;
    byModel[log.model].count++;
  }

  const opRows = Object.entries(byOp)
    .sort((a, b) => b[1].cost - a[1].cost)
    .map(([op, d]) => ({ label: op.replace(/_/g, " "), value: d.cost, sub: `${d.count} calls · $${d.cost.toFixed(4)}` }));

  const modelRows = Object.entries(byModel)
    .sort((a, b) => b[1].cost - a[1].cost)
    .map(([model, d]) => ({ label: model, value: d.cost, sub: `${d.count} calls · $${d.cost.toFixed(4)}` }));

  return (
    <div>
      <h1 className="text-4xl font-thin text-anthracite mb-1">AI Cost</h1>
      <p className="text-xs font-light text-on-surface-variant mb-8">Last 30 days</p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-md p-4 shadow-ambient">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
            This month
          </p>
          <p className="text-3xl font-thin text-anthracite leading-none mb-1">
            ${costThisMonth.toFixed(4)}
          </p>
          <p className="text-xs font-light text-on-surface-variant">{callsThisMonth} calls</p>
        </div>
        <div className="bg-white rounded-md p-4 shadow-ambient">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
            Avg per call
          </p>
          <p className="text-3xl font-thin text-anthracite leading-none mb-1">
            ${avgPerCall.toFixed(4)}
          </p>
          <p className="text-xs font-light text-on-surface-variant">30-day window</p>
        </div>
        <div className="col-span-2 bg-white rounded-md p-4 shadow-ambient">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
            All time (30-day window)
          </p>
          <p className="text-3xl font-thin text-anthracite leading-none mb-1">
            ${costAllTime.toFixed(4)}
          </p>
          <p className="text-xs font-light text-on-surface-variant">{logs.length} total calls shown</p>
        </div>
      </div>

      {/* Daily bar chart */}
      <div className="bg-white rounded-md p-4 shadow-ambient mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-4">
          Daily cost — last 30 days
        </p>
        <div className="flex items-end gap-[3px]" style={{ height: "80px" }}>
          {chartDays.map(([day, costs]) => {
            const total = costs.parse_link + costs.parse_image + costs.recommendation;
            const barPx = total > 0 ? Math.max((total / maxDayCost) * 80, 3) : 0;
            return (
              <div
                key={day}
                className="flex-1 flex flex-col overflow-hidden rounded-[1px]"
                style={{ height: `${barPx}px` }}
                title={`${day}\n$${total.toFixed(6)}`}
              >
                {costs.recommendation > 0 && (
                  <div
                    className="flex-shrink-0"
                    style={{
                      height: `${(costs.recommendation / total) * 100}%`,
                      backgroundColor: "#D1D5DB",
                    }}
                  />
                )}
                {costs.parse_image > 0 && (
                  <div
                    className="flex-shrink-0"
                    style={{
                      height: `${(costs.parse_image / total) * 100}%`,
                      backgroundColor: "#6B7280",
                    }}
                  />
                )}
                {costs.parse_link > 0 && (
                  <div
                    className="flex-shrink-0"
                    style={{
                      height: `${(costs.parse_link / total) * 100}%`,
                      backgroundColor: "#252729",
                    }}
                  />
                )}
                {total === 0 && <div className="flex-1 bg-surface-low" />}
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 mt-3">
          {[
            { color: "#252729", label: "Link parse" },
            { color: "#6B7280", label: "Image parse" },
            { color: "#D1D5DB", label: "Recommend" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-[10px] font-light text-on-surface-variant">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <BreakdownCard title="By operation" rows={opRows} />
        <BreakdownCard title="By model" rows={modelRows} />
      </div>

      {/* Recent calls table */}
      <div className="bg-white rounded-md shadow-ambient overflow-hidden">
        <div className="px-4 pt-4 pb-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
            Recent calls
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-light">
            <thead>
              <tr className="bg-surface-low">
                {["Time", "User", "Operation", "Model", "Tokens in/out", "Cost", "Duration", ""].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentLogs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-on-surface-variant">
                    No AI calls logged yet
                  </td>
                </tr>
              )}
              {recentLogs.map((log) => (
                <tr key={log.id} className="border-t border-surface-low">
                  <td className="px-4 py-2.5 text-on-surface-variant whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString("en", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {log.user_id ? (userMap.get(log.user_id) ?? "—") : "—"}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{log.operation}</td>
                  <td className="px-4 py-2.5 text-on-surface-variant whitespace-nowrap">
                    {log.model}
                  </td>
                  <td className="px-4 py-2.5 text-on-surface-variant whitespace-nowrap">
                    {log.input_tokens != null
                      ? `${log.input_tokens.toLocaleString()} / ${(log.output_tokens ?? 0).toLocaleString()}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 font-normal whitespace-nowrap">
                    {log.cost_usd != null ? `$${Number(log.cost_usd).toFixed(5)}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-on-surface-variant whitespace-nowrap">
                    {log.duration_ms != null ? `${log.duration_ms}ms` : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={log.success ? "text-green-600" : "text-red-500"}>
                      {log.success ? "✓" : "✗"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: number; sub: string }[];
}) {
  const max = Math.max(...rows.map((r) => r.value), 0.000001);
  return (
    <div className="bg-white rounded-md p-4 shadow-ambient">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-4">
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-xs font-light text-on-surface-variant">No data yet</p>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map(({ label, value, sub }) => (
            <div key={label}>
              <div className="flex justify-between mb-1.5">
                <span className="text-xs font-light text-anthracite capitalize">{label}</span>
                <span className="text-xs font-light text-on-surface-variant">{sub}</span>
              </div>
              <div className="h-1 bg-surface-low rounded-full overflow-hidden">
                <div
                  className="h-full bg-anthracite rounded-full transition-all"
                  style={{ width: `${(value / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
