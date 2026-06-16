import { requireAdmin } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { SocialMediaClient, type FollowCandidate } from "./social-media-client";

export const dynamic = "force-dynamic";

export default async function SocialMediaPage() {
  await requireAdmin();
  const service = createServiceClient();

  const { data } = await service
    .from("ig_follow_candidates")
    .select("id, handle, display_name, category, region, note, follower_tier, status, needs_verify")
    .order("needs_verify", { ascending: true })
    .order("follower_tier", { ascending: false })
    .order("region", { ascending: true });

  const candidates = (data ?? []) as FollowCandidate[];

  return <SocialMediaClient initial={candidates} />;
}
