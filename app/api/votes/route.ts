import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Support both JSON body and form data
  const contentType = request.headers.get("content-type") ?? "";
  let recipeId: string, value: number;

  if (contentType.includes("application/json")) {
    const body = await request.json();
    recipeId = body.recipeId;
    value = Number(body.value);
  } else {
    const form = await request.formData();
    recipeId = form.get("recipeId") as string;
    value = Number(form.get("value"));
  }

  if (!recipeId || !value || value < 1 || value > 5) {
    return NextResponse.json({ error: "Invalid vote" }, { status: 400 });
  }

  // Upsert vote
  const { error } = await supabase
    .from("votes")
    .upsert({ recipe_id: recipeId, user_id: user.id, value }, { onConflict: "recipe_id,user_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Redirect back to recipe page if form submission
  if (!contentType.includes("application/json")) {
    return new Response(null, {
      status: 303,
      headers: { Location: `/recipe/${recipeId}` },
    });
  }

  return NextResponse.json({ success: true });
}
