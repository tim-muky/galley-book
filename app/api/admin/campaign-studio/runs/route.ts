import { requireAdminApi } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { generateRecipeCandidates, type GalleyBrief } from "@/lib/marketing/generate-recipes";
import { NextResponse } from "next/server";
import { z } from "zod";

export const maxDuration = 60;

const BriefSchema = z.object({
  theme: z.string().min(1).max(200),
  notes: z.string().max(500).optional(),
  locale: z.enum(["en", "de"]).optional(),
});

export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if ("response" in guard) return guard.response;
  const user = guard.user;

  const parsed = BriefSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const brief: GalleyBrief = parsed.data;

  const service = createServiceClient();

  const { data: run, error: insertErr } = await service
    .from("galley_runs")
    .insert({
      created_by: user.id,
      status: "candidates_pending",
      brief,
    })
    .select("id")
    .single();

  if (insertErr || !run) {
    logger.error("campaign_studio.run.insert_failed", { message: insertErr?.message });
    return NextResponse.json({ error: "Failed to create run" }, { status: 500 });
  }

  try {
    const candidates = await generateRecipeCandidates(brief);

    const { error: updateErr } = await service
      .from("galley_runs")
      .update({
        status: "candidates_ready",
        candidates: candidates.map((c) => ({ ...c, keep: true })),
      })
      .eq("id", run.id);

    if (updateErr) throw new Error(updateErr.message);

    logger.info("campaign_studio.run.candidates_generated", {
      runId: run.id,
      adminId: user.id,
      candidateCount: candidates.length,
    });

    return NextResponse.json({ runId: run.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await service
      .from("galley_runs")
      .update({ status: "failed", error: message })
      .eq("id", run.id);
    logger.error("campaign_studio.run.generation_failed", {
      runId: run.id,
      message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
