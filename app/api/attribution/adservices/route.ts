import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveAdServicesToken } from "@/lib/adservices";
import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { z } from "zod";

// GAL-439: native clients POST their Apple Search Ads AdServices attribution
// token here (once per install, after sign-in). We resolve it against Apple's
// AdServices API and persist the campaign/keyword onto the user row (first-
// touch — see migration 056 / lib/attribution.ts for the web UTM sibling).

const InputSchema = z.object({
  // AdServices tokens are long opaque base64-ish strings.
  token: z.string().min(20).max(2000),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = InputSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.message }, { status: 400 });
  }

  const result = await resolveAdServicesToken(body.data.token);

  // Apple hasn't registered the install yet — tell the client to retry. We do
  // NOT stamp asa_captured_at, so a later attempt can still resolve it.
  if (result.status === "pending") {
    return NextResponse.json({ status: "pending" });
  }
  // Malformed/expired token — definitive, client should stop retrying. Don't
  // stamp the row (nothing to record), but the client treats this as "done".
  if (result.status === "invalid") {
    return NextResponse.json({ status: "invalid" });
  }
  if (result.status === "error") {
    logger.warn("adservices.resolve_failed", {
      userId: user.id,
      httpStatus: result.httpStatus,
    });
    return NextResponse.json({ error: "AdServices resolution failed" }, { status: 502 });
  }

  // Resolved (ad tap OR organic). Persist first-touch via the service role,
  // mirroring the UTM write in app/auth/callback. The `.is(asa_captured_at,
  // null)` guard makes this idempotent and first-touch — re-POSTs are no-ops.
  const a = result.data;
  try {
    const service = createServiceClient();
    const { error } = await service
      .from("users")
      .update({
        asa_attributed: a.attribution,
        asa_campaign_id: a.campaignId,
        asa_keyword_id: a.keywordId,
        asa_ad_group_id: a.adGroupId,
        asa_ad_id: a.adId,
        asa_org_id: a.orgId,
        asa_conversion_type: a.conversionType,
        asa_click_date: a.clickDate,
        asa_country_or_region: a.countryOrRegion,
        asa_raw: a,
        asa_captured_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .is("asa_captured_at", null);
    if (error) {
      logger.error("adservices.persist_failed", {
        userId: user.id,
        message: error.message,
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } catch (err) {
    logger.error("adservices.persist_threw", {
      userId: user.id,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "persist failed" }, { status: 500 });
  }

  // "recorded" = real ad attribution; "organic" = resolved but not from an ad.
  return NextResponse.json({ status: a.attribution ? "recorded" : "organic" });
}
