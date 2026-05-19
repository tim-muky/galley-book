import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { renderGalleyPdf } from "@/lib/pdf/galley-pdf";
import { NextResponse } from "next/server";

// GAL-318: export a galley as a printable PDF cookbook.
// Auth-gated by RLS; the user must be a member of the galley OR the galley
// must be public (the existing recipes SELECT policy enforces that).

export const dynamic = "force-dynamic";
// Allow the request a generous-ish budget — rendering 100 recipes with
// images can run a few seconds.
export const maxDuration = 60;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: galleyId } = await context.params;

  const { data: galley, error: galleyErr } = await supabase
    .from("galleys")
    .select("id, name, owner_id")
    .eq("id", galleyId)
    .maybeSingle();
  if (galleyErr || !galley) {
    return NextResponse.json({ error: "Galley not found" }, { status: 404 });
  }

  const { data: recipes, error: recipesErr } = await supabase
    .from("recipes")
    .select(
      "id, name, description, servings, prep_time, ingredients(id, name, amount, unit, sort_order, group_name), preparation_steps(id, step_number, instruction)",
    )
    .eq("galley_id", galleyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (recipesErr) {
    logger.error("galley.export.fetch_failed", {
      galleyId,
      userId: user.id,
      message: recipesErr.message,
    });
    return NextResponse.json({ error: "Failed to load recipes" }, { status: 500 });
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderGalleyPdf({
      galleyName: galley.name,
      recipes: (recipes ?? []) as never,
    });
  } catch (err) {
    logger.error("galley.export.render_failed", {
      galleyId,
      userId: user.id,
      message: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "Failed to render PDF" }, { status: 500 });
  }

  logger.info("galley.export.success", {
    galleyId,
    userId: user.id,
    recipeCount: recipes?.length ?? 0,
    bytes: pdfBuffer.byteLength,
  });

  // Cast Buffer to Uint8Array so the BodyInit overload matches.
  return new Response(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${slugify(galley.name)}.pdf"`,
    },
  });
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "galley"
  );
}
