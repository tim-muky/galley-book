import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { parsePlayReferrer } from "@/lib/playReferrer";
import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { z } from "zod";

// GAL-444: Android clients POST their Google Play Install Referrer here once
// per install (after sign-in). We parse the UTM params into the existing
// first-touch utm_* columns (mirrors the web UTM write in auth/callback) and
// store the raw referrer + timestamps. Android equivalent of the iOS
// /api/attribution/adservices endpoint.

const InputSchema = z.object({
  referrer: z.string().min(1).max(2000),
  referrerClickTimestampSeconds: z.number().int().nonnegative().optional(),
  installBeginTimestampSeconds: z.number().int().nonnegative().optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = InputSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.message }, { status: 400 });
  }

  const { referrer, referrerClickTimestampSeconds, installBeginTimestampSeconds } = body.data;
  const utm = parsePlayReferrer(referrer);
  const toIso = (s?: number) => (s && s > 0 ? new Date(s * 1000).toISOString() : null);

  // First-touch via the service role, sharing the attribution_captured_at guard
  // with the web UTM write — so a web-first signup is never overwritten, and an
  // Android-first install populates utm_* once.
  try {
    const service = createServiceClient();
    const { error } = await service
      .from("users")
      .update({
        utm_source: utm.source,
        utm_medium: utm.medium,
        utm_campaign: utm.campaign,
        utm_content: utm.content,
        utm_term: utm.term,
        attribution_captured_at: new Date().toISOString(),
        play_install_referrer: referrer,
        play_referrer_click_at: toIso(referrerClickTimestampSeconds),
        play_install_begin_at: toIso(installBeginTimestampSeconds),
      })
      .eq("id", user.id)
      .is("attribution_captured_at", null);
    if (error) {
      logger.error("play_referrer.persist_failed", {
        userId: user.id,
        message: error.message,
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } catch (err) {
    logger.error("play_referrer.persist_threw", {
      userId: user.id,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "persist failed" }, { status: 500 });
  }

  return NextResponse.json({ status: utm.source ? "recorded" : "organic" });
}
