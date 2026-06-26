import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { checkPageviewLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// GAL-483: first-party pageview logging. Public + unauthenticated — anonymous
// visitors POST one row per page view. Vercel Web Analytics has no query API, so
// we collect our own to power the daily growth report + admin dashboard. No PII
// stored: no IP, no persistent id; `country` is the coarse edge geo header and
// `session_id` is an ephemeral client sessionStorage value. See migration 064.

const Body = z.object({
  path: z.string().min(1).max(512),
  referrer: z.string().max(2048).optional(),
  utm_source: z.string().max(256).optional(),
  utm_medium: z.string().max(256).optional(),
  utm_campaign: z.string().max(256).optional(),
  utm_content: z.string().max(256).optional(),
  session_id: z.string().max(64).optional(),
});

/** Host only — drop the path/query of the referrer so we never store a full URL. */
function hostOf(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkPageviewLimit(ip);
  if (!rl.allowed) return new NextResponse(null, { status: 429 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const country = request.headers.get("x-vercel-ip-country");

  try {
    const service = createServiceClient();
    const { error } = await service.from("page_views").insert({
      path: body.path,
      referrer_host: hostOf(body.referrer),
      utm_source: body.utm_source ?? null,
      utm_medium: body.utm_medium ?? null,
      utm_campaign: body.utm_campaign ?? null,
      utm_content: body.utm_content ?? null,
      country: country || null,
      session_id: body.session_id ?? null,
    });
    if (error) logger.error("pageview.insert_failed", { message: error.message });
  } catch (e) {
    logger.error("pageview.insert_threw", {
      message: e instanceof Error ? e.message : String(e),
    });
  }

  // Always 204 — visitor-facing tracking must never surface an error.
  return new NextResponse(null, { status: 204 });
}
