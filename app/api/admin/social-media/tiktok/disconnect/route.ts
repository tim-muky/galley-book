import { requireAdminApi } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";

const API = "https://open.tiktokapis.com";

export async function POST() {
  const guard = await requireAdminApi();
  if ("response" in guard) return guard.response;

  const service = createServiceClient();
  const { data: conn } = await service
    .from("tiktok_oauth")
    .select("access_token")
    .eq("id", 1)
    .maybeSingle();

  // Best-effort revoke on TikTok's side so the next connect shows the consent
  // screen fresh (required for the Content Posting API review demo).
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (conn?.access_token && clientKey && clientSecret) {
    try {
      await fetch(`${API}/v2/oauth/revoke/`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: clientKey,
          client_secret: clientSecret,
          token: conn.access_token,
        }),
      });
    } catch (err) {
      logger.warn("admin.tiktok.revoke_failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await service.from("tiktok_oauth").delete().eq("id", 1);
  logger.info("admin.tiktok.disconnected", {});
  return NextResponse.json({ ok: true });
}
