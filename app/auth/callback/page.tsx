"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Suspense } from "react";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("code");
    const rawNext = searchParams.get("next") ?? "/library";
    const next =
      rawNext.startsWith("/") && !rawNext.startsWith("//")
        ? rawNext
        : "/library";

    if (!code) {
      router.replace("/auth/login?error=no_code");
      return;
    }

    const supabase = createClient();
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        router.replace(
          `/auth/login?error=${encodeURIComponent(error.message)}`
        );
      } else {
        // Full page navigation so the browser sends a fresh HTTP request
        // with the newly-written session cookies — client-side router.replace
        // can navigate before cookies are visible to the server proxy.
        window.location.href = next;
      }
    });
  }, []);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <p className="text-sm font-light text-on-surface-variant">Signing in…</p>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense>
      <CallbackHandler />
    </Suspense>
  );
}
