import { requireAdminApi } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";

export async function POST() {
  const guard = await requireAdminApi();
  if ("response" in guard) return guard.response;

  const service = createServiceClient();
  await service.from("instagram_oauth").delete().eq("id", 1);
  logger.info("admin.instagram.disconnected", {});
  return NextResponse.json({ ok: true });
}
