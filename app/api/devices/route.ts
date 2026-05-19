import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { z } from "zod";

// GAL-329: native clients POST their Expo push token here on app launch
// and after sign-in. Upserts by token so a device that's reassigned to a
// different user (e.g. logout / re-login) doesn't accumulate stale rows.

const InputSchema = z.object({
  expoPushToken: z.string().min(10).max(200),
  platform: z.enum(["ios", "android"]),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = InputSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.message }, { status: 400 });
  }
  const { expoPushToken, platform } = body.data;

  // Upsert on expo_push_token. Re-point user_id if it changed (logout
  // then sign-in as a different account on the same device).
  const { error } = await supabase
    .from("user_devices")
    .upsert(
      {
        user_id: user.id,
        expo_push_token: expoPushToken,
        platform,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "expo_push_token" },
    );
  if (error) {
    logger.error("devices.register.failed", {
      userId: user.id,
      message: error.message,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  // RLS scopes the delete to the user's own rows.
  const { error } = await supabase
    .from("user_devices")
    .delete()
    .eq("expo_push_token", token);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
