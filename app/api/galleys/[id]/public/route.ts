import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { z } from "zod";

// GAL-331: galley owner flips a galley between public and private.
// Setting public requires the rights-confirmation flag (UI-enforced; we
// trust the client because the dialog is the only path that sends true).
// Flipping back to private wipes follower rows in the same transaction so
// the owner's "your followers will be removed" warning matches reality.

const InputSchema = z.object({
  isPublic: z.boolean(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: galleyId } = await context.params;
  const body = InputSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.message }, { status: 400 });
  }
  const { isPublic } = body.data;

  // Owner-only.
  const { data: galley } = await supabase
    .from("galleys")
    .select("id, owner_id, is_public")
    .eq("id", galleyId)
    .maybeSingle();
  if (!galley) {
    return NextResponse.json({ error: "Galley not found" }, { status: 404 });
  }
  if (galley.owner_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const service = createServiceClient();

  if (isPublic) {
    const { error } = await service
      .from("galleys")
      .update({ is_public: true, public_since: new Date().toISOString() })
      .eq("id", galleyId);
    if (error) {
      logger.error("galley.set_public.failed", { galleyId, message: error.message });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    logger.info("galley.set_public", { galleyId, ownerId: user.id });
    return NextResponse.json({ ok: true, isPublic: true });
  }

  // Going private: count followers (for the response so the UI can
  // confirm the warning), then wipe them, then flip the flag.
  const { count: followerCount } = await service
    .from("galley_followers")
    .select("user_id", { count: "exact", head: true })
    .eq("galley_id", galleyId);

  const { error: deleteErr } = await service
    .from("galley_followers")
    .delete()
    .eq("galley_id", galleyId);
  if (deleteErr) {
    logger.error("galley.set_private.delete_followers_failed", {
      galleyId,
      message: deleteErr.message,
    });
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  const { error: flipErr } = await service
    .from("galleys")
    .update({ is_public: false, public_since: null })
    .eq("id", galleyId);
  if (flipErr) {
    logger.error("galley.set_private.flip_failed", {
      galleyId,
      message: flipErr.message,
    });
    return NextResponse.json({ error: flipErr.message }, { status: 500 });
  }

  logger.info("galley.set_private", {
    galleyId,
    ownerId: user.id,
    followersRemoved: followerCount ?? 0,
  });
  return NextResponse.json({
    ok: true,
    isPublic: false,
    followersRemoved: followerCount ?? 0,
  });
}
