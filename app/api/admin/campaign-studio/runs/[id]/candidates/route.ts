import { requireAdminApi } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { z } from "zod";

const CandidateSchema = z.object({
  name: z.string(),
  oneLiner: z.string(),
  tags: z.array(z.string()),
  keep: z.boolean(),
  imagePath: z.string().optional(),
  imagePrompt: z.string().optional(),
});

const InputSchema = z.object({
  candidates: z.array(CandidateSchema),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const parsed = InputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service
    .from("galley_runs")
    .update({ candidates: parsed.data.candidates })
    .eq("id", id);

  if (error) {
    logger.error("campaign_studio.candidates.update_failed", { runId: id, message: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
