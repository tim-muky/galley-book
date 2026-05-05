"use client";

import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense } from "react";
import Image from "next/image";
import { Link } from "@/i18n/routing";

function LoginContent() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/library";
  const t = useTranslations("auth");

  async function signInWithGoogle() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `https://app.galleybook.com/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  }

  async function signInWithApple() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: {
        redirectTo: `https://app.galleybook.com/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-12">
        <div className="flex flex-col items-center gap-3 w-full">
          <Image
            src="/logo.png"
            alt="galleybook"
            width={400}
            height={400}
            className="w-full h-auto object-contain"
            priority
          />
          <h1 className="text-2xl font-thin tracking-widest text-anthracite uppercase">
            galleybook
          </h1>
          <p className="text-sm font-light text-on-surface-variant text-center">
            {t("tagline")}
          </p>
        </div>

        {searchParams.get("error") && (
          <p className="text-xs text-red-500 text-center bg-red-50 rounded-md px-3 py-2">
            {searchParams.get("error")}
          </p>
        )}

        <div className="w-full flex flex-col gap-3">
          <button
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 bg-[#252729] text-white font-light text-sm rounded-full py-4 px-6 transition-opacity hover:opacity-80 active:opacity-70"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="white"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#e0e0e0"/>
              <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#c0c0c0"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#a0a0a0"/>
            </svg>
            {t("continueWithGoogle")}
          </button>

          <button
            onClick={signInWithApple}
            className="w-full flex items-center justify-center gap-3 bg-white text-anthracite font-light text-sm rounded-full py-4 px-6 border border-anthracite transition-opacity hover:opacity-80 active:opacity-70"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
              <path d="M14.94 9.57c-.02-2.13 1.74-3.16 1.82-3.21-1-1.46-2.55-1.66-3.1-1.68-1.32-.13-2.58.78-3.25.78-.68 0-1.71-.76-2.81-.74-1.45.02-2.78.84-3.52 2.13-1.5 2.6-.38 6.46 1.08 8.58.71 1.04 1.56 2.2 2.66 2.16 1.07-.04 1.47-.69 2.77-.69 1.29 0 1.66.69 2.79.66 1.15-.02 1.88-1.05 2.59-2.1.81-1.21 1.15-2.38 1.17-2.44-.03-.02-2.24-.86-2.26-3.41l.06-.04zM12.83 3.34c.58-.71.97-1.69.86-2.67-.83.04-1.85.57-2.45 1.27-.54.62-1.01 1.62-.89 2.58.93.07 1.88-.47 2.48-1.18z"/>
            </svg>
            {t("continueWithApple")}
          </button>
        </div>

        <p className="text-xs font-light text-on-surface-variant text-center leading-relaxed">
          {t.rich("termsNotice", {
            terms: (chunks) => (
              <Link href="/terms" className="underline underline-offset-2">
                {chunks}
              </Link>
            ),
            privacy: (chunks) => (
              <Link href="/privacy" className="underline underline-offset-2">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
