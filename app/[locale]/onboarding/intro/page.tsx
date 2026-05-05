import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { IntroCards } from "./intro-cards";

export const dynamic = "force-dynamic";

export default async function OnboardingIntroPage() {
  const supabase = await createClient();
  const locale = await getLocale();
  const t = await getTranslations("onboarding.intro");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-white">
      <div className="w-full max-w-sm">
        <IntroCards
          labels={{
            cards: [
              { title: t("card1.title"), body: t("card1.body") },
              { title: t("card2.title"), body: t("card2.body") },
              { title: t("card3.title"), body: t("card3.body") },
            ],
            skip: t("skip"),
            next: t("next"),
            done: t("done"),
          }}
        />
      </div>
    </div>
  );
}
