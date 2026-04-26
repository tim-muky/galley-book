import { createClient } from "@/lib/supabase/server";
import { ImportTestClient } from "./import-test-client";

export const dynamic = "force-dynamic";

export default async function ImportTestPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Find or create the "test-kitchen" galley
  const { data: existing } = await supabase
    .from("galleys")
    .select("id")
    .eq("owner_id", user!.id)
    .eq("name", "test-kitchen")
    .maybeSingle();

  let testKitchenGalleyId: string;

  if (existing) {
    testKitchenGalleyId = existing.id;
  } else {
    const { data: newId } = await supabase.rpc("create_galley", {
      galley_name: "test-kitchen",
      owner: user!.id,
    });
    testKitchenGalleyId = newId as string;
  }

  return <ImportTestClient testKitchenGalleyId={testKitchenGalleyId} />;
}
