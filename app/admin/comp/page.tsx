import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/auth/admin";
import { CompClient } from "./comp-client";

export const dynamic = "force-dynamic";

type CompRow = {
  id: string;
  galley_id: string;
  status: "active" | "expired" | "in_billing_retry" | "cancelled" | "revoked";
  starts_at: string;
  expires_at: string | null;
  grant_reason: string | null;
  revoked_at: string | null;
  created_at: string;
  galleys: { name: string } | null;
  granter: { name: string | null; email: string } | null;
};

type GalleyRow = { id: string; name: string; owner_email: string | null };

export default async function CompAdminPage() {
  await requireAdmin();
  const service = createServiceClient();

  const [{ data: compsRaw }, { data: galleysRaw }] = await Promise.all([
    service
      .from("iap_subscriptions")
      .select(
        "id, galley_id, status, starts_at, expires_at, grant_reason, revoked_at, created_at, galleys(name), granter:users!iap_subscriptions_granted_by_fkey(name, email)"
      )
      .eq("source", "comp")
      .order("created_at", { ascending: false })
      .limit(100),
    service
      .from("galleys")
      .select("id, name, users!galleys_owner_id_fkey(email)")
      .order("name"),
  ]);

  const comps = (compsRaw ?? []) as unknown as CompRow[];
  const galleys: GalleyRow[] = (galleysRaw ?? []).map(
    (g: { id: string; name: string; users: { email: string } | { email: string }[] | null }) => ({
      id: g.id,
      name: g.name,
      owner_email: Array.isArray(g.users) ? (g.users[0]?.email ?? null) : (g.users?.email ?? null),
    })
  );

  const active = comps.filter((c) => c.status === "active");
  const past = comps.filter((c) => c.status !== "active");

  return (
    <div>
      <h1 className="text-4xl font-thin text-anthracite mb-1">Comp entitlement</h1>
      <p className="text-xs font-light text-on-surface-variant mb-8">
        Grant free galleybook premium to a galley. Bypasses Apple IAP. {active.length} active.
      </p>

      <CompClient galleys={galleys} active={active} past={past} />
    </div>
  );
}
