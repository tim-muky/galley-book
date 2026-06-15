import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import sharp from "sharp";

// The carousel slides are authored 4:5 (1080×1350) for Instagram. TikTok's
// photo player is 9:16, so a 4:5 slide gets top-fitted with a black bar. This
// proxy is TikTok-only, so we pad each slide onto a 1080×1920 frame with a
// blurred backdrop of itself — the slide stays centered and readable, no seam.
const TIKTOK_W = 1080;
const TIKTOK_H = 1920;

/** Letterbox a slide into TikTok's 9:16 frame over a blurred cover of itself. */
async function padTo916(input: Buffer): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  // Already 9:16 (within tolerance) → serve untouched.
  if (
    meta.width &&
    meta.height &&
    Math.abs(meta.width / meta.height - TIKTOK_W / TIKTOK_H) < 0.01
  ) {
    return input;
  }
  const [background, foreground] = await Promise.all([
    sharp(input).resize(TIKTOK_W, TIKTOK_H, { fit: "cover" }).blur(40).modulate({ brightness: 0.9 }).toBuffer(),
    sharp(input).resize(TIKTOK_W, TIKTOK_H, { fit: "inside" }).toBuffer(),
  ]);
  return sharp(background)
    .composite([{ input: foreground, gravity: "center" }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

/**
 * Public, no-auth proxy for a Campaign Studio carousel slide.
 *
 * The slides are already public in Supabase Storage, but TikTok's
 * Content Posting API only accepts PULL_FROM_URL images on a domain the app
 * has verified — and we can't verify *.supabase.co. Serving the bytes through
 * galleybook.com (a domain we own and can verify in the TikTok portal) makes
 * the carousel postable to TikTok. Resolves on the landing host because the
 * proxy passes /api/* through (see proxy.ts).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ galleyId: string; slide: string }> },
) {
  const { galleyId, slide } = await params;

  // Guard the dynamic segments — only a uuid galley + integer slide index map
  // to a real asset path, so path traversal is impossible.
  if (!/^[0-9a-f-]{36}$/i.test(galleyId) || !/^\d{1,2}$/.test(slide)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const storagePath = `campaign-assets/${galleyId}/slide-${slide}.jpg`;
  const service = createServiceClient();
  const { data, error } = await service.storage.from("recipe-photos").download(storagePath);
  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const raw = Buffer.from(await data.arrayBuffer());
  let body: Uint8Array = raw;
  try {
    body = await padTo916(raw);
  } catch (err) {
    // Never block a post on framing — fall back to the original bytes.
    logger.warn("campaign_studio.tiktok.slide_pad_failed", {
      galleyId,
      slide,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
