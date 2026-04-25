import { createClient } from "@/lib/supabase/server";
import { isSafeUrl } from "@/lib/utils/url-validation";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response(null, { status: 401 });

  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url || !isSafeUrl(url)) return new Response(null, { status: 400 });

  const isInstagram = url.includes("cdninstagram.com") || url.includes("fbcdn.net");

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        ...(isInstagram ? { Referer: "https://www.instagram.com/" } : {}),
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return new Response(null, { status: 502 });

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const buffer = await res.arrayBuffer();

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
