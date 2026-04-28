import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";

// Cleans up orphaned files under recipe-photos/temp/{userId}/* that the parse
// route uploaded as a stable URL for Instagram CDN images. The save route
// re-uploads them to {recipeId}/primary.{ext}, leaving the temp copy behind.
//
// Runs daily at 03:00 UTC via vercel.json. Vercel cron sends an
// `Authorization: Bearer ${CRON_SECRET}` header — set CRON_SECRET in the
// project env vars before this route can run.

const TEMP_PREFIX = "temp";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const BUCKET = "recipe-photos";

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const cutoff = Date.now() - MAX_AGE_MS;

  const { data: userFolders, error: listError } = await service.storage
    .from(BUCKET)
    .list(TEMP_PREFIX, { limit: 1000 });

  if (listError) {
    logger.error("cron_cleanup_temp_list_failed", { error: listError.message });
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }

  const toDelete: string[] = [];
  for (const folder of userFolders ?? []) {
    if (!folder.name) continue;
    const { data: files, error: filesError } = await service.storage
      .from(BUCKET)
      .list(`${TEMP_PREFIX}/${folder.name}`, { limit: 1000 });

    if (filesError) {
      logger.warn("cron_cleanup_temp_user_list_failed", {
        userFolder: folder.name,
        error: filesError.message,
      });
      continue;
    }

    for (const file of files ?? []) {
      if (!file.created_at) continue;
      if (new Date(file.created_at).getTime() < cutoff) {
        toDelete.push(`${TEMP_PREFIX}/${folder.name}/${file.name}`);
      }
    }
  }

  if (toDelete.length === 0) {
    logger.info("cron_cleanup_temp_done", { deleted: 0 });
    return NextResponse.json({ deleted: 0 });
  }

  const { error: delError } = await service.storage.from(BUCKET).remove(toDelete);
  if (delError) {
    logger.error("cron_cleanup_temp_delete_failed", {
      error: delError.message,
      attempted: toDelete.length,
    });
    return NextResponse.json(
      { error: delError.message, attempted: toDelete.length },
      { status: 500 }
    );
  }

  logger.info("cron_cleanup_temp_done", { deleted: toDelete.length });
  return NextResponse.json({ deleted: toDelete.length });
}
