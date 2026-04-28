import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Resolves which galley the user is currently looking at.
 *
 * Priority:
 *   1. `active_galley_id` cookie set by GalleySwitcher — only honoured if the
 *      user is still a member of that galley.
 *   2. The membership flagged `is_default`.
 *   3. The earliest `invited_at` membership.
 *
 * Returns null if the user has no memberships.
 *
 * Use everywhere a server page or route handler needs "the user's galley"
 * without an explicit galleyId from the client. Pages that already accept an
 * explicit selection (settings, new recipe form) should keep doing so.
 */
export async function resolveActiveGalleyId(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<string | null> {
  const cookieStore = await cookies();
  const cookieGalleyId = cookieStore.get("active_galley_id")?.value;

  const { data: memberships } = await supabase
    .from("galley_members")
    .select("galley_id, is_default")
    .eq("user_id", userId)
    .order("invited_at", { ascending: true });

  if (!memberships?.length) return null;

  if (cookieGalleyId) {
    const fromCookie = memberships.find((m) => m.galley_id === cookieGalleyId);
    if (fromCookie) return fromCookie.galley_id;
  }

  return (memberships.find((m) => m.is_default) ?? memberships[0]).galley_id;
}
