import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { InviteStep } from "./invite-step";

export const dynamic = "force-dynamic";

export default async function OnboardingInvitePage() {
  const supabase = await createClient();
  const locale = await getLocale();
  const t = await getTranslations("onboarding.step2");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const { data: membership } = await supabase
    .from("galley_members")
    .select("galley_id")
    .eq("user_id", user.id)
    .order("invited_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) redirect(`/${locale}/onboarding`);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-white">
      <div className="w-full max-w-sm">
        <h1 className="text-4xl font-thin text-anthracite leading-tight mb-2">{t("title")}</h1>
        <p className="text-sm font-light text-on-surface-variant mb-8">{t("subtitle")}</p>
        <InviteStep
          galleyId={membership.galley_id}
          labels={{
            generating: t("generating"),
            copy: t("copy"),
            copied: t("copied"),
            skip: t("skip"),
            done: t("done"),
            error: t("error"),
          }}
        />
      </div>
    </div>
  );
}
