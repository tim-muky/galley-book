import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { z } from "zod";

// Android is in closed testing only (GAL-275 / GAL-77). Landing-page visitors on
// Android can leave their email here to be notified at public launch. The caller
// is unauthenticated, so we write via the service role (see migration 057).

const InputSchema = z.object({
  email: z.string().email().max(320),
  locale: z.string().max(8).optional(),
});

export async function POST(request: Request) {
  const body = InputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const email = body.data.email.trim().toLowerCase();
  const service = createServiceClient();

  // Idempotent: a repeat signup with the same email is a no-op, not an error.
  const { error } = await service.from("android_waitlist").upsert(
    {
      email,
      locale: body.data.locale ?? null,
      user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
    },
    { onConflict: "email", ignoreDuplicates: true }
  );

  if (error) {
    logger.error("android_waitlist.insert_failed", { message: error.message });
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }

  return NextResponse.json({ status: "ok" });
}
