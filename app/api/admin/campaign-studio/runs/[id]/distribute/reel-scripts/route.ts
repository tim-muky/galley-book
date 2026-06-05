import { requireAdminApi } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { generateReelScripts } from "@/lib/marketing/reel-script";
import type { RunCandidateWithImage } from "@/app/admin/campaign-studio/runs/[id]/curate-images/curate-images-client";
import { NextResponse } from "next/server";

// One AI call; quick. Scripts are returned to the client (copy-paste), not
// persisted — Phase A is a filming aid, not a stored asset.
export const maxDuration = 60;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const service = createServiceClient();

  const { data: run, error } = await service
    .from("galley_runs")
    .select("brief, candidates, status, published_galley_id")
    .eq("id", id)
    .single();
  if (error || !run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  if (run.status !== "published") {
    return NextResponse.json(
      { error: "Run must be published before generating reel scripts" },
      { status: 400 },
    );
  }

  const brief = run.brief as { theme?: string; country?: string; style?: string; locale?: "en" | "de" };
  const locale = brief.locale ?? "de";
  const theme =
    brief.theme || [brief.country, brief.style].filter(Boolean).join(" · ") || "Galley of the Week";
  const candidates = (run.candidates as RunCandidateWithImage[]) ?? [];
  const recipeNames = candidates.filter((c) => c.keep && c.name.trim()).map((c) => c.name);

  try {
    const scripts = await generateReelScripts({ theme, recipeNames, locale });
    return NextResponse.json({ ok: true, scripts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("campaign_studio.reel_scripts.failed", { runId: id, message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
