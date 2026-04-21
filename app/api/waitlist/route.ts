import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { sendWaitlistConfirmation, notifyWaitlistSignup } from "@/lib/email";

export async function POST(request: Request) {
  const { email } = await request.json();

  if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const normalised = email.trim().toLowerCase();
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("waitlist")
    .insert({ email: normalised });

  // Duplicate signup — treat as success so we don't leak whether an email exists
  if (error && error.code !== "23505") {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }

  // Fire emails in parallel; don't block the response on failures
  Promise.all([
    sendWaitlistConfirmation(normalised),
    notifyWaitlistSignup(normalised),
  ]).catch(() => {});

  return NextResponse.json({ success: true }, { status: 201 });
}
