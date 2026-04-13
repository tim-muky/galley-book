"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Suspense } from "react";

function CallbackHandler() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const rawNext = searchParams.get("next") ?? "/library";
    const next =
      rawNext.startsWith("/") && !rawNext.startsWith("//")
        ? rawNext
        : "/library";

    // createBrowserClient has detectSessionInUrl: true, so it automatically
    // detects ?code= in the URL and exchanges it via PKCE during initialize().
    // We must NOT call exchangeCodeForSession() ourselves — doing so races
    // with auto-init and always fails because the code verifier is already
    // consumed. Instead, listen for the SIGNED_IN event.
    const supabase = createClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "SIGNED_IN") {
          subscription.unsubscribe();
          window.location.href = next;
        }
      }
    );

    // Safety: if auto-init already completed before our listener registered,
    // check for an existing session.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        subscription.unsubscribe();
        window.location.href = next;
      }
    });

    // Timeout fallback — if nothing happens after 10s, redirect with error
    const timeout = setTimeout(() => {
      subscription.unsubscribe();
      window.location.href = "/auth/login?error=timeout";
    }, 10000);

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
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
