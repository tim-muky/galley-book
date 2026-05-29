import { requireAdmin } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";
import { SelectClient } from "./select-client";

export const dynamic = "force-dynamic";

export default async function ImportGalleyPage({
  params,
}: {
  params: Promise<{ galleyId: string }>;
}) {
  await requireAdmin();
  const { galleyId } = await params;

  const service = createServiceClient();
  const { data: galley } = await service
    .from("galleys")
    .select("id, name, is_public")
    .eq("id", galleyId)
    .single();
  if (!galley || !galley.is_public) notFound();

  const { data: recipes } = await service
    .from("recipes")
    .select("id, name, description, recipe_photos(storage_path, is_primary)")
    .eq("galley_id", galleyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const items = (recipes ?? []).map((r) => {
    const photos =
      (r.recipe_photos as { storage_path: string; is_primary: boolean }[] | null) ?? [];
    const primary = photos.find((p) => p.is_primary) ?? photos[0];
    return {
      id: r.id as string,
      name: r.name as string,
      description: (r.description as string | null) ?? null,
      photoPath: primary?.storage_path ?? null,
    };
  });

  return (
    <SelectClient galleyId={galleyId} galleyName={galley.name as string} recipes={items} />
  );
}
