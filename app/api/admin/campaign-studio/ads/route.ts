import { requireAdminApi } from "@/lib/auth/admin";
import {
  setWeeklyBudget,
  pauseCampaign,
  resumeCampaign,
  pauseAd,
  resumeAd,
  MetaAdsError,
} from "@/lib/marketing/meta-ads";
import { NextResponse } from "next/server";
import { z } from "zod";

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("budget"), weeklyEuros: z.number().positive().max(10000) }),
  z.object({ action: z.literal("pause") }),
  z.object({ action: z.literal("resume") }),
  z.object({ action: z.literal("pause_ad"), adId: z.string().min(1) }),
  z.object({ action: z.literal("resume_ad"), adId: z.string().min(1) }),
]);

export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if ("response" in guard) return guard.response;

  const parsed = ActionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    switch (parsed.data.action) {
      case "budget":
        await setWeeklyBudget(parsed.data.weeklyEuros);
        break;
      case "pause":
        await pauseCampaign();
        break;
      case "resume":
        await resumeCampaign();
        break;
      case "pause_ad":
        await pauseAd(parsed.data.adId);
        break;
      case "resume_ad":
        await resumeAd(parsed.data.adId);
        break;
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof MetaAdsError
        ? `${err.message}${err.code ? ` (code ${err.code})` : ""}`
        : err instanceof Error
          ? err.message
          : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
