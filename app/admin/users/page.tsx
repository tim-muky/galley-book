import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/auth/admin";

type UserRow = { id: string; name: string | null; email: string; avatar_url: string | null; created_at: string };
type RecipeRow = { id: string; name: string; created_by: string | null; galley_id: string; created_at: string };
type VoteRow = { recipe_id: string; user_id: string; value: number; created_at: string };
type GalleyRow = { id: string; name: string };

type FeedEvent =
  | { kind: "recipe"; at: string; userId: string | null; recipeName: string; galleyName: string }
  | { kind: "vote"; at: string; userId: string; recipeName: string; value: number };

export default async function UsersPage() {
  await requireAdmin();
  const service = createServiceClient();

  const [{ data: usersRaw }, { data: recipesRaw }, { data: votesRaw }, { data: galleysRaw }] =
    await Promise.all([
      service.from("users").select("id, name, email, avatar_url, created_at").order("created_at"),
      service
        .from("recipes")
        .select("id, name, created_by, galley_id, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500),
      service
        .from("votes")
        .select("recipe_id, user_id, value, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      service.from("galleys").select("id, name"),
    ]);

  const users = (usersRaw ?? []) as UserRow[];
  const recipes = (recipesRaw ?? []) as RecipeRow[];
  const votes = (votesRaw ?? []) as VoteRow[];
  const galleys = (galleysRaw ?? []) as GalleyRow[];

  const galleyMap = new Map(galleys.map((g) => [g.id, g.name]));
  const recipeMap = new Map(recipes.map((r) => [r.id, r.name]));
  const userMap = new Map(users.map((u) => [u.id, u.name ?? u.email.split("@")[0]]));

  // Per-user stats
  const recipesByUser = new Map<string, RecipeRow[]>();
  for (const r of recipes) {
    if (!r.created_by) continue;
    if (!recipesByUser.has(r.created_by)) recipesByUser.set(r.created_by, []);
    recipesByUser.get(r.created_by)!.push(r);
  }

  const votesByUser = new Map<string, VoteRow[]>();
  for (const v of votes) {
    if (!votesByUser.has(v.user_id)) votesByUser.set(v.user_id, []);
    votesByUser.get(v.user_id)!.push(v);
  }

  // Last active: max of latest recipe + latest vote per user
  function lastActive(userId: string): string | null {
    const latestRecipe = recipesByUser.get(userId)?.[0]?.created_at ?? null;
    const latestVote = votesByUser.get(userId)?.[0]?.created_at ?? null;
    if (!latestRecipe && !latestVote) return null;
    if (!latestRecipe) return latestVote;
    if (!latestVote) return latestRecipe;
    return latestRecipe > latestVote ? latestRecipe : latestVote;
  }

  // Activity feed: merge recent recipes + votes, sort desc, take top 40
  const feed: FeedEvent[] = [
    ...recipes.slice(0, 40).map(
      (r): FeedEvent => ({
        kind: "recipe",
        at: r.created_at,
        userId: r.created_by,
        recipeName: r.name,
        galleyName: galleyMap.get(r.galley_id) ?? "—",
      })
    ),
    ...votes.slice(0, 40).map(
      (v): FeedEvent => ({
        kind: "vote",
        at: v.created_at,
        userId: v.user_id,
        recipeName: recipeMap.get(v.recipe_id) ?? "Unknown recipe",
        value: v.value,
      })
    ),
  ]
    .sort((a, b) => (a.at > b.at ? -1 : 1))
    .slice(0, 40);

  const now = new Date();

  // Build last 30 days (oldest → newest) for the two charts
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const dayKey = (iso: string) => iso.slice(0, 10);

  // Daily active users — distinct users who created a recipe or cast a vote that day
  const dauSets = new Map<string, Set<string>>(days.map((d) => [d, new Set()]));
  for (const r of recipes) {
    if (!r.created_by) continue;
    const k = dayKey(r.created_at);
    dauSets.get(k)?.add(r.created_by);
  }
  for (const v of votes) {
    const k = dayKey(v.created_at);
    dauSets.get(k)?.add(v.user_id);
  }
  const dauSeries = days.map((d) => ({ day: d, value: dauSets.get(d)!.size }));
  const maxDau = Math.max(1, ...dauSeries.map((p) => p.value));

  // New users per day — bucketed signups
  const signupCounts = new Map<string, number>(days.map((d) => [d, 0]));
  for (const u of users) {
    const k = dayKey(u.created_at);
    if (signupCounts.has(k)) signupCounts.set(k, signupCounts.get(k)! + 1);
  }
  const newUserSeries = days.map((d) => ({ day: d, value: signupCounts.get(d) ?? 0 }));
  const maxNew = Math.max(1, ...newUserSeries.map((p) => p.value));

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
  }

  function fmtRelative(iso: string) {
    const diffMs = now.getTime() - new Date(iso).getTime();
    const diffDays = Math.floor(diffMs / 86_400_000);
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return `${Math.floor(diffDays / 30)}mo ago`;
  }

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleString("en", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div>
      <h1 className="text-4xl font-thin text-anthracite mb-1">Users</h1>
      <p className="text-xs font-light text-on-surface-variant mb-8">
        {users.length} {users.length === 1 ? "member" : "members"}
      </p>

      {/* Activity charts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <DailyChart
          title="Daily active users — last 30 days"
          series={dauSeries}
          max={maxDau}
          color="#7FB76C"
        />
        <DailyChart
          title="New users per day — last 30 days"
          series={newUserSeries}
          max={maxNew}
          color="#D54CB1"
        />
      </div>

      {/* User table */}
      <div className="bg-white rounded-md shadow-ambient overflow-hidden mb-6">
        <div className="px-4 pt-4 pb-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
            Members
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-light">
            <thead>
              <tr className="bg-surface-low">
                {["User", "Joined", "Last active", "Recipes", "Votes"].map((h) => (
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
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-on-surface-variant">
                    No users yet
                  </td>
                </tr>
              )}
              {users.map((u) => {
                const last = lastActive(u.id);
                return (
                  <tr key={u.id} className="border-t border-surface-low">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar user={u} />
                        <div>
                          <p className="font-normal text-anthracite leading-none">
                            {u.name ?? "—"}
                          </p>
                          <p className="text-[10px] text-on-surface-variant mt-0.5">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">
                      {fmtDate(u.created_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {last ? (
                        <span title={fmtDate(last)}>{fmtRelative(last)}</span>
                      ) : (
                        <span className="text-on-surface-variant">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-normal text-anthracite">
                      {recipesByUser.get(u.id)?.length ?? 0}
                    </td>
                    <td className="px-4 py-3 font-normal text-anthracite">
                      {votesByUser.get(u.id)?.length ?? 0}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Activity feed */}
      <div className="bg-white rounded-md shadow-ambient overflow-hidden">
        <div className="px-4 pt-4 pb-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
            Recent activity
          </p>
        </div>

        {feed.length === 0 ? (
          <p className="px-4 pb-6 text-xs font-light text-on-surface-variant">No activity yet</p>
        ) : (
          <ul>
            {feed.map((event, i) => (
              <li key={i} className="flex items-start gap-3 px-4 py-3 border-t border-surface-low">
                {/* Dot indicator */}
                <div className="mt-0.5 flex-shrink-0 w-2 h-2 rounded-full bg-anthracite opacity-20" />

                <div className="flex-1 min-w-0">
                  {event.kind === "recipe" ? (
                    <p className="text-xs font-light text-anthracite">
                      <span className="font-normal">
                        {event.userId ? (userMap.get(event.userId) ?? "Someone") : "Someone"}
                      </span>{" "}
                      added{" "}
                      <span className="font-normal">"{event.recipeName}"</span>
                      <span className="text-on-surface-variant"> · {event.galleyName}</span>
                    </p>
                  ) : (
                    <p className="text-xs font-light text-anthracite">
                      <span className="font-normal">
                        {userMap.get(event.userId) ?? "Someone"}
                      </span>{" "}
                      rated{" "}
                      <span className="font-normal">"{event.recipeName}"</span>{" "}
                      <span className="text-on-surface-variant">
                        {"★".repeat(event.value)}{"☆".repeat(5 - event.value)}
                      </span>
                    </p>
                  )}
                </div>

                <span className="flex-shrink-0 text-[10px] font-light text-on-surface-variant whitespace-nowrap">
                  {fmtTime(event.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DailyChart({
  title,
  series,
  max,
  color,
}: {
  title: string;
  series: { day: string; value: number }[];
  max: number;
  color: string;
}) {
  const total = series.reduce((s, p) => s + p.value, 0);
  return (
    <div className="bg-white rounded-md p-4 shadow-ambient">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-1">
        {title}
      </p>
      <p className="text-2xl font-thin text-anthracite mb-4">{total}</p>
      <div className="flex items-end gap-[3px]" style={{ height: "80px" }}>
        {series.map(({ day, value }) => {
          const barPx = value > 0 ? Math.max((value / max) * 80, 3) : 0;
          return (
            <div
              key={day}
              className="flex-1 rounded-[1px]"
              style={{
                height: `${barPx}px`,
                backgroundColor: value > 0 ? color : undefined,
              }}
              title={`${day} · ${value}`}
            >
              {value === 0 && <div className="w-full h-full bg-surface-low rounded-[1px]" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Avatar({ user }: { user: UserRow }) {
  const initial = (user.name ?? user.email)?.[0]?.toUpperCase() ?? "?";
  if (user.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatar_url}
        alt={user.name ?? user.email}
        className="w-7 h-7 rounded-full object-cover flex-shrink-0"
      />
    );
  }
  return (
    <div className="w-7 h-7 rounded-full bg-surface-low flex items-center justify-center flex-shrink-0">
      <span className="text-[10px] font-semibold text-anthracite">{initial}</span>
    </div>
  );
}
