import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const locale = await getLocale();
  const t = await getTranslations("onboarding.step1");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const { data: userRow } = await supabase
    .from("users")
    .select("name")
    .eq("id", user.id)
    .single();

  const dbName = (userRow as { name: string | null } | null)?.name?.trim() ?? "";
  const metaName = ((user.user_metadata?.full_name as string | undefined) ?? "").trim();
  const initialName = dbName || metaName;

  const { count: membershipCount } = await supabase
    .from("galley_members")
    .select("galley_id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (dbName && (membershipCount ?? 0) > 0) {
    redirect(`/${locale}/library`);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-white">
      <div className="w-full max-w-sm">
        <h1 className="text-4xl font-thin text-anthracite leading-tight mb-2">{t("title")}</h1>
        <p className="text-sm font-light text-on-surface-variant mb-8">{t("subtitle")}</p>
        <OnboardingForm
          initialName={initialName}
          labels={{
            nameLabel: t("nameLabel"),
            galleyLabel: t("galleyLabel"),
            galleyPlaceholder: t("galleyPlaceholder"),
            submit: t("submit"),
            submitting: t("submitting"),
          }}
        />
      </div>
    </div>
  );
}
