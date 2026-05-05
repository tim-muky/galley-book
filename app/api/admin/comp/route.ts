import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminApi } from "@/lib/auth/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if ("response" in guard) return guard.response;
  const admin = guard.user;

  const body = (await request.json().catch(() => null)) as
    | { galley_id?: string; expires_at?: string | null; reason?: string }
    | null;

  const galleyId = body?.galley_id?.trim();
  const reason = body?.reason?.trim();
  const expiresAt = body?.expires_at ? new Date(body.expires_at) : null;

  if (!galleyId) return NextResponse.json({ error: "galley_id is required" }, { status: 400 });
  if (!reason) return NextResponse.json({ error: "reason is required" }, { status: 400 });
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return NextResponse.json({ error: "expires_at is not a valid date" }, { status: 400 });
  }
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "expires_at must be in the future" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: galley } = await service
    .from("galleys")
    .select("id, owner_id, name")
    .eq("id", galleyId)
    .single();

  if (!galley) return NextResponse.json({ error: "galley not found" }, { status: 404 });

  const { data: existing } = await service
    .from("iap_subscriptions")
    .select("id, source")
    .eq("galley_id", galleyId)
    .eq("status", "active")
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      {
        error: `galley already has an active ${existing.source} subscription. Revoke it first.`,
      },
      { status: 409 }
    );
  }

  const { data: row, error } = await service
    .from("iap_subscriptions")
    .insert({
      user_id: galley.owner_id,
      galley_id: galley.id,
      product_id: "com.galleybook.premium.monthly",
      source: "comp",
      status: "active",
      starts_at: new Date().toISOString(),
      expires_at: expiresAt?.toISOString() ?? null,
      granted_by: admin.id,
      grant_reason: reason,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id: row.id }, { status: 201 });
}

export async function GET() {
  const guard = await requireAdminApi();
  if ("response" in guard) return guard.response;

  const service = createServiceClient();

  const { data, error } = await service
    .from("iap_subscriptions")
    .select(
      "id, galley_id, status, source, starts_at, expires_at, grant_reason, granted_by, revoked_at, revoked_by, created_at, galleys(name), granter:users!iap_subscriptions_granted_by_fkey(name, email)"
    )
    .eq("source", "comp")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ comps: data ?? [] });
}
