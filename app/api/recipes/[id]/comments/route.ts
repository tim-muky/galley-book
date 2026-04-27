import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { body } = (await request.json()) as { body?: string };
  const trimmed = body?.trim();
  if (!trimmed) return NextResponse.json({ error: "Body is required" }, { status: 400 });
  if (trimmed.length > 2000) return NextResponse.json({ error: "Comment too long" }, { status: 400 });

  const { data, error } = await supabase
    .from("recipe_comments")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({ recipe_id: id, author_id: user.id, body: trimmed } as any)
    .select("id, body, created_at, author_id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
