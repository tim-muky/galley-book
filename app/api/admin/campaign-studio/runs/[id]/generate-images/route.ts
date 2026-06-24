import { requireAdminApi } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { generateRecipeImage } from "@/lib/marketing/generate-recipes";
import type { RunCandidate } from "@/app/admin/campaign-studio/runs/[id]/curate-candidates/curate-client";
import { NextResponse } from "next/server";

// Imagen 4 is ~5-10s per image; processing ~7-10 kept candidates in
// parallel can take up to a few minutes. Requires Vercel Pro for >60s.
export const maxDuration = 300;

const BUCKET = "recipe-photos";

interface CandidateWithImage extends RunCandidate {
  imagePath?: string;
  imagePrompt?: string;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if ("response" in guard) return guard.response;
  const adminUser = guard.user;

  const { id } = await params;
  const service = createServiceClient();

  const { data: run, error: fetchErr } = await service
    .from("galley_runs")
    .select("id, candidates")
    .eq("id", id)
    .single();
  if (fetchErr || !run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const candidates = (run.candidates as CandidateWithImage[]) ?? [];
  // Idempotent: only generate for kept candidates that don't already have
  // an image. Lets the user re-trigger after a timeout without re-paying
  // for already-rendered images.
  const targets = candidates
    .map((c, idx) => ({ c, idx }))
    .filter(({ c }) => c.keep && c.name.trim() && !c.imagePath);

  if (targets.length === 0) {
    await service.from("galley_runs").update({ status: "images_ready" }).eq("id", id);
    return NextResponse.json({ ok: true, generated: 0 });
  }

  await service.from("galley_runs").update({ status: "images_pending" }).eq("id", id);

  const results = await Promise.allSettled(
    targets.map(async ({ c, idx }) => {
      const img = await generateRecipeImage({ name: c.name, oneLiner: c.oneLiner }, { userId: adminUser.id });
      const path = `galley-runs/${id}/${idx}-${Date.now()}.png`;
      const buffer = Buffer.from(img.base64, "base64");
      const { error: upErr } = await service.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: img.mediaType, upsert: true });
      if (upErr) throw new Error(`upload: ${upErr.message}`);
      return { idx, path, prompt: img.prompt };
    }),
  );

  // Merge results back into the candidates array. Failures leave imagePath
  // unset so the curate-images UI can show a retry affordance per row.
  const updated = candidates.slice();
  let succeeded = 0;
  const failures: { idx: number; reason: string }[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      updated[r.value.idx] = {
        ...updated[r.value.idx],
        imagePath: r.value.path,
        imagePrompt: r.value.prompt,
      };
      succeeded++;
    } else {
      const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
      failures.push({ idx: -1, reason });
    }
  }

  const allDone = updated.every((c) => !c.keep || !c.name.trim() || c.imagePath);

  const { error: updateErr } = await service
    .from("galley_runs")
    .update({
      candidates: updated,
      status: allDone ? "images_ready" : "images_pending",
    })
    .eq("id", id);

  if (updateErr) {
    logger.error("campaign_studio.images.persist_failed", { runId: id, message: updateErr.message });
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  logger.info("campaign_studio.images.generated", {
    runId: id,
    requested: targets.length,
    succeeded,
    failed: failures.length,
  });

  return NextResponse.json({
    ok: true,
    generated: succeeded,
    failures,
  });
}
