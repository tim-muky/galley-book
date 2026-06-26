"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * GAL-483: fire one first-party pageview per route into /api/track/pageview.
 * Uses sendBeacon (fetch keepalive fallback) so it never blocks navigation, and
 * an ephemeral sessionStorage id (no persistent identifier → no consent needed).
 * utm is read from the live URL so the entry page carries the acquisition signal.
 */

const SESSION_KEY = "gb_session_id";

function sessionId(): string | undefined {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return undefined;
  }
}

export function PageviewTracker() {
  const pathname = usePathname();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || lastSent.current === pathname) return;
    lastSent.current = pathname;

    const sp = new URLSearchParams(window.location.search);
    const payload = {
      path: pathname,
      referrer: document.referrer || undefined,
      utm_source: sp.get("utm_source") || undefined,
      utm_medium: sp.get("utm_medium") || undefined,
      utm_campaign: sp.get("utm_campaign") || undefined,
      utm_content: sp.get("utm_content") || undefined,
      session_id: sessionId(),
    };
    const body = JSON.stringify(payload);

    try {
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/track/pageview",
          new Blob([body], { type: "application/json" }),
        );
      } else {
        void fetch("/api/track/pageview", {
          method: "POST",
          body,
          keepalive: true,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch {
      // best-effort; never break the page
    }
  }, [pathname]);

  return null;
}
