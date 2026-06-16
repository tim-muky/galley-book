import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

/**
 * Public, no-auth proxy for a Campaign Studio reel MP4 (GAL-454).
 *
 * Same rationale as the slide proxy: TikTok's Content Posting API only accepts
 * PULL_FROM_URL media on a domain the app has verified, and we can't verify
 * *.supabase.co. Serving the rendered reel through galleybook.com (a verified
 * domain) makes it postable to TikTok as a video. Resolves on the landing host
 * because the proxy passes /api/* through (see proxy.ts).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ galleyId: string }> },
) {
  const { galleyId } = await params;

  // Guard the dynamic segment — only a uuid galley maps to a real asset path.
  if (!/^[0-9a-f-]{36}$/i.test(galleyId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const storagePath = `campaign-assets/${galleyId}/reel.mp4`;
  const service = createServiceClient();
  const { data, error } = await service.storage.from("recipe-photos").download(storagePath);
  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const bytes = new Uint8Array(await data.arrayBuffer());
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
