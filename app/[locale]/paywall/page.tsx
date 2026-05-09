import { getTranslations } from "next-intl/server";
import { PaywallContent } from "./paywall-content";

export const dynamic = "force-dynamic";

// Web paywall surface mirroring the native PaywallScreen visual design
// (green trial card, feature list, "Start 3-day free trial" CTA). Apple
// compliance forbids selling the subscription on web, so the CTA opens the
// App Store rather than completing a purchase.
export default async function PaywallPage() {
  const t = await getTranslations("paywall");

  return (
    <PaywallContent
      labels={{
        title: t("title"),
        tagline: t("tagline"),
        features: [
          t("featureUnlimited"),
          t("featureAi"),
          t("featureRecommendations"),
          t("featureFamily"),
        ],
        trialHeadline: t("trialHeadline"),
        trialSub: t("trialSub"),
        startTrial: t("startTrial"),
        legal: t("legal"),
        terms: t("terms"),
        privacy: t("privacy"),
      }}
    />
  );
}
