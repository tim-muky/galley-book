import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminApi } from "@/lib/auth/admin";
import { logger } from "@/lib/logger";
import { sendPushToUsers } from "@/lib/push/send";
import { NextResponse } from "next/server";
import { z } from "zod";

// GAL-330: admin announcement — platform-wide push notification pinned to
// a specific recipe. Recipients tap the notification and land on the
// recipe with an "Add to my galley" CTA.
//
// Gated server-side via requireAdminApi (public.users.is_admin flag).

const InputSchema = z.object({
  recipeId: z.string().uuid(),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(240),
});

export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if ("response" in guard) return guard.response;
  const user = guard.user;

  const body = InputSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.message }, { status: 400 });
  }
  const { recipeId, title, body: messageBody } = body.data;

  // Resolve the recipe with the service client so admin can announce any
  // recipe regardless of galley membership.
  const service = createServiceClient();
  const { data: recipe } = await service
    .from("recipes")
    .select("id, name, galley_id")
    .eq("id", recipeId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!recipe) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  // Fan-out target: every authenticated user (one device-row per user, the
  // send helper deals with multi-device). We deliberately do NOT scope by
  // galley membership — this is a platform broadcast.
  const { data: allUsers, error: usersErr } = await service
    .from("user_devices")
    .select("user_id");
  if (usersErr) {
    logger.error("admin.announce.user_lookup_failed", {
      message: usersErr.message,
    });
    return NextResponse.json({ error: "Failed to enumerate recipients" }, { status: 500 });
  }
  const userIds = Array.from(new Set((allUsers ?? []).map((u) => u.user_id)));

  const result = await sendPushToUsers(userIds, {
    eventType: "admin_announcement",
    title,
    body: messageBody,
    data: {
      screen: "recipe",
      recipeId: recipe.id,
      recipeName: recipe.name,
      admin: true,
    },
  });

  logger.info("admin.announce.sent", {
    adminId: user.id,
    recipeId: recipe.id,
    ...result,
  });

  return NextResponse.json({ ok: true, ...result });
}
