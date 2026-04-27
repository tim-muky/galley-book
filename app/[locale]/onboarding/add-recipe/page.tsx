import { Link } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";

export default async function OnboardingAddRecipePage() {
  const t = await getTranslations("onboarding.step3");

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-white">
      <div className="w-full max-w-sm">
        <h1 className="text-4xl font-thin text-anthracite leading-tight mb-2">{t("title")}</h1>
        <p className="text-sm font-light text-on-surface-variant mb-8">{t("subtitle")}</p>
        <div className="space-y-3">
          <Link
            href="/new"
            style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
            className="w-full block text-center border text-sm font-light py-4 rounded-full"
          >
            {t("start")}
          </Link>
          <Link
            href="/library"
            className="w-full block text-center text-sm font-light py-3 text-on-surface-variant"
          >
            {t("skip")}
          </Link>
        </div>
      </div>
    </div>
  );
}
