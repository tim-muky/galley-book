import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminApi } from "@/lib/auth/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdminApi();
  if ("response" in guard) return guard.response;
  const admin = guard.user;

  const { id } = await params;
  const service = createServiceClient();

  const { data: row } = await service
    .from("iap_subscriptions")
    .select("id, source, status")
    .eq("id", id)
    .single();

  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.source !== "comp") {
    return NextResponse.json({ error: "only comp entitlements can be revoked here" }, { status: 400 });
  }
  if (row.status !== "active") {
    return NextResponse.json({ error: `already ${row.status}` }, { status: 409 });
  }

  const { error } = await service
    .from("iap_subscriptions")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_by: admin.id,
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
