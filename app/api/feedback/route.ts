import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { Resend } from "resend";

export async function POST(request: Request) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { category, comment, pageUrl } = await request.json();
  if (!comment?.trim()) return NextResponse.json({ error: "comment required" }, { status: 400 });

  // Fetch user profile for name
  const { data: profile } = await supabase
    .from("users")
    .select("name, email")
    .eq("id", user.id)
    .single();

  const userName = profile?.name ?? user.email ?? "Unknown user";
  const userEmail = profile?.email ?? user.email ?? "";

  const { error } = await resend.emails.send({
    from: "Galley Book <onboarding@resend.dev>",
    to: "tim@muky-kids.com",
    subject: `[Galley Book] ${category} from ${userName}`,
    text: [
      `Category: ${category}`,
      `From: ${userName} (${userEmail})`,
      `Page: ${pageUrl}`,
      ``,
      comment.trim(),
    ].join("\n"),
  });

  if (error) {
    console.error("[feedback] Resend error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
