import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Support both JSON and form data
  const contentType = request.headers.get("content-type") ?? "";
  let name: string;

  if (contentType.includes("application/json")) {
    const body = await request.json();
    name = body.name;
  } else {
    const form = await request.formData();
    name = form.get("name") as string;
  }

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .rpc("create_galley", { galley_name: name.trim(), owner: user.id });

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to create galley" }, { status: 500 });
  }

  const galley = { id: data as string };

  if (!contentType.includes("application/json")) {
    return new Response(null, { status: 303, headers: { Location: "/library" } });
  }

  return NextResponse.json({ id: galley.id }, { status: 201 });
}
