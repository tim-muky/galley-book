"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Suspense } from "react";

function CallbackHandler() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState("Signing in…");

  useEffect(() => {
    const rawNext = searchParams.get("next") ?? "/library";
    const next =
      rawNext.startsWith("/") && !rawNext.startsWith("//")
        ? rawNext
        : "/library";

    const supabase = createClient();

    // Handle any auth event that brings a session — covers both
    // INITIAL_SESSION (if auto-init already ran) and SIGNED_IN.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setStatus(`${event} · session=${session ? "yes" : "no"}`);
        if (session) {
          subscription.unsubscribe();
          setStatus("Redirecting…");
          window.location.href = next;
        }
      }
    );

    // Timeout fallback so the user sees an error instead of a blank page
    const timeout = setTimeout(() => {
      subscription.unsubscribe();
      setStatus("Timed out — no session received");
    }, 10000);

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-3 px-6">
      <p className="text-sm font-light text-on-surface-variant">{status}</p>
      {status.includes("·") && (
        <p className="text-xs text-red-500 text-center max-w-xs">{status}</p>
      )}
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
