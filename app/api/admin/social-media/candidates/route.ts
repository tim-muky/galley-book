import { requireAdminApi } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

/** Mark an IG follow-candidate as followed or skipped (GAL-455). */
export async function PATCH(request: Request) {
  const guard = await requireAdminApi();
  if ("response" in guard) return guard.response;

  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : null;
  const status = body?.status === "followed" || body?.status === "skipped" ? body.status : null;
  if (!id || !status) {
    return NextResponse.json({ error: "id and status (followed|skipped) required" }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service
    .from("ig_follow_candidates")
    .update({ status, actioned_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
