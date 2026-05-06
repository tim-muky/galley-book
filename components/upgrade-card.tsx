"use client";

import { useTranslations } from "next-intl";

// GAL-277 — replaces the misleading "Nothing matched" / raw English error
// the web client used to surface when an AI route returned 403 with
// `upgrade: true`. Apple compliance prevents selling the subscription on
// web, so this card just points users to the iOS app where the trial +
// purchase live.

const APP_STORE_URL = "https://apps.apple.com/app/id6764606059";

export function UpgradeCard() {
  const t = useTranslations("upgrade");
  return (
    <div className="bg-surface-low rounded-md px-5 py-6 shadow-ambient flex flex-col items-stretch gap-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
          {t("eyebrow")}
        </span>
        <h3 className="text-2xl font-thin text-anthracite leading-tight">
          {t("title")}
        </h3>
        <p className="text-sm font-light text-on-surface-variant leading-relaxed">
          {t("body")}
        </p>
      </div>
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
        className="border text-sm font-light py-3 rounded-full text-center"
      >
        {t("appStoreCta")}
      </a>
    </div>
  );
}
