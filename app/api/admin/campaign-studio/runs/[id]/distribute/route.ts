import { requireAdminApi } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { z } from "zod";

const CaptionPatchSchema = z.object({
  caption_de: z.string().max(2200).optional(),
  caption_en: z.string().max(2200).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const parsed = CaptionPatchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const service = createServiceClient();

  const { data: run } = await service
    .from("galley_runs")
    .select("published_galley_id")
    .eq("id", id)
    .single();
  if (!run?.published_galley_id) {
    return NextResponse.json({ error: "Run not published" }, { status: 400 });
  }

  const { data: dist, error } = await service
    .from("galley_distributions")
    .update(parsed.data)
    .eq("galley_id", run.published_galley_id)
    .select()
    .single();
  if (error || !dist) {
    return NextResponse.json({ error: error?.message ?? "No distribution found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, distribution: dist });
}
