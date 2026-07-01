import { requireAdmin } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { SocialMediaClient, type FollowCandidate } from "./social-media-client";
import { TikTokConnection, type TikTokConnectionState } from "./tiktok-connection";
import { InstagramConnection, type InstagramConnectionState } from "./instagram-connection";

export const dynamic = "force-dynamic";

export default async function SocialMediaPage({
  searchParams,
}: {
  searchParams: Promise<{ tiktok?: string; instagram?: string }>;
}) {
  await requireAdmin();
  const service = createServiceClient();

  const [{ data: candidatesData }, { data: conn }, { data: igConn }, { tiktok, instagram }] =
    await Promise.all([
      service
        .from("ig_follow_candidates")
        .select("id, handle, display_name, category, region, note, follower_tier, status, needs_verify")
        .order("needs_verify", { ascending: true })
        .order("follower_tier", { ascending: false })
        .order("region", { ascending: true }),
      service.from("tiktok_oauth").select("display_name, connected_at, scope").eq("id", 1).maybeSingle(),
      service.from("instagram_oauth").select("username, connected_at, scope").eq("id", 1).maybeSingle(),
      searchParams,
    ]);

  const candidates = (candidatesData ?? []) as FollowCandidate[];
  const connection: TikTokConnectionState = conn
    ? {
        connected: true,
        displayName: (conn.display_name as string | null) ?? null,
        connectedAt: (conn.connected_at as string | null) ?? null,
        scope: (conn.scope as string | null) ?? null,
      }
    : { connected: false, displayName: null, connectedAt: null, scope: null };

  const igConnection: InstagramConnectionState = igConn
    ? {
        connected: true,
        username: (igConn.username as string | null) ?? null,
        connectedAt: (igConn.connected_at as string | null) ?? null,
        scope: (igConn.scope as string | null) ?? null,
      }
    : { connected: false, username: null, connectedAt: null, scope: null };

  return (
    <>
      <InstagramConnection connection={igConnection} status={instagram ?? null} />
      <TikTokConnection connection={connection} status={tiktok ?? null} />
      <SocialMediaClient initial={candidates} />
    </>
  );
}
