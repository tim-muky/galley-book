import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

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

  return new NextResponse(await data.arrayBuffer(), {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
