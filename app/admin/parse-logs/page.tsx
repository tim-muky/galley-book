import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/auth/admin";

type ParseQualityLog = {
  id: string;
  created_at: string;
  source_url: string;
  platform: string;
  parsed_via: string | null;
  success: boolean;
  missing_fields: string[];
  error_message: string | null;
  recipe_name: string | null;
};

const PLATFORM_STYLE: Record<string, { bg: string; color: string }> = {
  instagram: { bg: "#EDE0F7", color: "#7B3FA0" },
  youtube:   { bg: "#FCE8E8", color: "#B03030" },
  tiktok:    { bg: "#E3F5F5", color: "#1A7A7A" },
  website:   { bg: "#E3EDF9", color: "#2D5FA0" },
};

function truncateUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = (u.pathname + u.search).slice(0, 36);
    return u.hostname.replace("www.", "") + path + (path.length === 36 ? "…" : "");
  } catch {
    return url.slice(0, 46);
  }
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleString("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ParseLogsPage() {
  await requireAdmin();
  const service = createServiceClient();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: raw } = await service
    .from("parse_quality_logs")
    .select("id, created_at, source_url, platform, parsed_via, success, missing_fields, error_message, recipe_name")
    .gte("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: false })
    .limit(100);

  const logs = (raw ?? []) as ParseQualityLog[];

  const failedCount  = logs.filter((l) => !l.success).length;
  const partialCount = logs.filter((l) => l.success && l.missing_fields.length > 0).length;

  return (
    <div>
      <h1 className="text-4xl font-thin text-anthracite mb-1">Parse Logs</h1>
      <p className="text-xs font-light text-on-surface-variant mb-8">
        Failed and partial imports · last 30 days
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-md p-4 shadow-ambient">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
              Failed
            </p>
          </div>
          <p className="text-3xl font-thin text-anthracite leading-none mb-1">{failedCount}</p>
          <p className="text-xs font-light text-on-surface-variant">could not parse</p>
        </div>

        <div className="bg-white rounded-md p-4 shadow-ambient">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#D4820A" }} />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
              Partial
            </p>
          </div>
          <p className="text-3xl font-thin text-anthracite leading-none mb-1">{partialCount}</p>
          <p className="text-xs font-light text-on-surface-variant">fields missing</p>
        </div>
      </div>

      {/* Log table */}
      <div className="bg-white rounded-md shadow-ambient overflow-hidden">
        <div className="px-4 pt-4 pb-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
            Problem imports — newest first
          </p>
        </div>

        {logs.length === 0 ? (
          <p className="px-4 pb-8 text-sm font-light text-on-surface-variant">
            No failed or partial imports in the last 30 days.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-light">
              <thead>
                <tr className="bg-surface-low">
                  {["Time", "Platform", "URL", "Status", "Missing fields", "Route"].map((h) => (
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
                {logs.map((log) => {
                  const platformStyle = PLATFORM_STYLE[log.platform] ?? PLATFORM_STYLE.website;
                  const isFailed = !log.success;

                  return (
                    <tr key={log.id} className="border-t border-surface-low hover:bg-surface-low transition-colors">
                      {/* Time */}
                      <td className="px-4 py-2.5 text-on-surface-variant whitespace-nowrap">
                        {timeLabel(log.created_at)}
                      </td>

                      {/* Platform */}
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span
                          className="inline-block text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5"
                          style={{ backgroundColor: platformStyle.bg, color: platformStyle.color }}
                        >
                          {log.platform}
                        </span>
                      </td>

                      {/* URL */}
                      <td className="px-4 py-2.5">
                        <a
                          href={log.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-anthracite hover:underline whitespace-nowrap block max-w-[200px] overflow-hidden text-ellipsis"
                          title={log.source_url}
                        >
                          {truncateUrl(log.source_url)}
                        </a>
                        {log.recipe_name && (
                          <span className="block text-[10px] text-on-surface-variant mt-0.5 max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">
                            {log.recipe_name}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {isFailed ? (
                          <span
                            className="inline-block text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5"
                            style={{ backgroundColor: "#FDECEA", color: "#C0392B" }}
                          >
                            Failed
                          </span>
                        ) : (
                          <span
                            className="inline-block text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5"
                            style={{ backgroundColor: "#FEF3CD", color: "#92650A" }}
                          >
                            Partial
                          </span>
                        )}
                      </td>

                      {/* Missing fields */}
                      <td className="px-4 py-2.5">
                        {log.missing_fields.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {log.missing_fields.map((f) => (
                              <span
                                key={f}
                                className="inline-block bg-surface-low text-on-surface-variant text-[10px] rounded-full px-2 py-0.5 whitespace-nowrap"
                              >
                                no {f}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-on-surface-variant text-[10px]">
                            {log.error_message ?? "—"}
                          </span>
                        )}
                      </td>

                      {/* Route */}
                      <td className="px-4 py-2.5 text-on-surface-variant whitespace-nowrap">
                        {log.parsed_via ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
