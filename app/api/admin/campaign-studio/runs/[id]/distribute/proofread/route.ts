import { requireAdminApi } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { proofreadDistribution } from "@/lib/marketing/proofread";
import { NextResponse } from "next/server";

// Fetching slides + a multimodal model call takes a bit; allow the long budget.
export const maxDuration = 120;

const BUCKET = "recipe-photos";

function publicUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if ("response" in guard) return guard.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const locale: "de" | "en" = body?.locale === "en" ? "en" : "de";

  const service = createServiceClient();
  const { data: run } = await service
    .from("galley_runs")
    .select("published_galley_id")
    .eq("id", id)
    .single();
  if (!run?.published_galley_id) {
    return NextResponse.json({ error: "Run not published" }, { status: 400 });
  }

  const { data: dist } = await service
    .from("galley_distributions")
    .select("carousel_paths, caption_de, caption_en")
    .eq("galley_id", run.published_galley_id)
    .maybeSingle();
  if (!dist) {
    return NextResponse.json({ error: "No assets generated yet" }, { status: 400 });
  }

  const paths = (dist.carousel_paths as string[]) ?? [];
  if (paths.length < 1) {
    return NextResponse.json({ error: "No carousel slides to proofread" }, { status: 400 });
  }
  const caption = (locale === "en" ? dist.caption_en : dist.caption_de) ?? "";

  const result = await proofreadDistribution({
    slideUrls: paths.map(publicUrl),
    caption,
    locale,
  });

  logger.info("campaign_studio.proofread.ran", {
    runId: id,
    locale,
    ok: result.ok,
    issueCount: result.issues.length,
  });
  return NextResponse.json(result);
}
