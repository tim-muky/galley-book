import { createClient } from "@/lib/supabase/server";
import { isSafeUrl } from "@/lib/utils/url-validation";

/** Hosts where browsers can't load images directly (Referer-required CDNs).
 *  Anything else can be loaded client-side via <img src="..."> — proxying it
 *  would just burn function bandwidth. */
const ALLOWED_HOSTS = [
  "cdninstagram.com",
  "fbcdn.net",
];

const MAX_BYTES = 8 * 1024 * 1024;

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return ALLOWED_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response(null, { status: 401 });

  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url || !isSafeUrl(url)) return new Response(null, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!isAllowedHost(parsed.hostname)) {
    return new Response(null, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        Referer: "https://www.instagram.com/",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return new Response(null, { status: 502 });

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      return new Response(null, { status: 502 });
    }

    // Reject early on declared length over the cap
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > MAX_BYTES) return new Response(null, { status: 413 });

    // Stream-and-cap so a server lying about content-length can't blow memory
    if (!res.body) return new Response(null, { status: 502 });
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      chunks.push(value);
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
