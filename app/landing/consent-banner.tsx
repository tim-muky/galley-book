"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const CONSENT_KEY = "galley-cookie-consent";
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

export function initMetaPixel() {
  if (!PIXEL_ID || typeof window === "undefined") return;
  const w = window as any;
  if (w.fbq) return;
  w.fbq = function (...args: unknown[]) {
    (w.fbq.q = w.fbq.q || []).push(args);
  };
  w.fbq.push = w.fbq;
  w.fbq.loaded = true;
  w.fbq.version = "2.0";
  w.fbq.queue = [];
  w.fbq("init", PIXEL_ID);
  w.fbq("track", "PageView");
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(s);
}

export function hasConsent(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(CONSENT_KEY) === "accepted";
}

export function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (!stored) {
      setVisible(true);
    } else if (stored === "accepted") {
      initMetaPixel();
    }
  }, []);

  if (!visible) return null;

  function accept() {
    localStorage.setItem(CONSENT_KEY, "accepted");
    setVisible(false);
    initMetaPixel();
  }

  function decline() {
    localStorage.setItem(CONSENT_KEY, "declined");
    setVisible(false);
  }

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 px-4 pb-4 md:pb-6">
      <div
        className="max-w-2xl mx-auto rounded-2xl px-5 py-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center"
        style={{ backgroundColor: "#252729" }}
      >
        <p className="text-xs font-light leading-relaxed flex-1" style={{ color: "rgba(255,255,255,0.75)" }}>
          Wir verwenden den Meta Pixel, um unser Marketing zu messen und
          relevante Werbung zu schalten.{" "}
          <Link
            href="/datenschutz"
            className="underline underline-offset-2"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            Datenschutzerklärung
          </Link>
        </p>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={decline}
            className="px-4 py-2 rounded-full text-xs font-light transition-opacity hover:opacity-70 whitespace-nowrap"
            style={{ color: "#fff", border: "1px solid rgba(255,255,255,0.3)" }}
          >
            Nur notwendige
          </button>
          <button
            onClick={accept}
            className="px-4 py-2 rounded-full text-xs font-light transition-opacity hover:opacity-80 whitespace-nowrap"
            style={{ backgroundColor: "#fff", color: "#252729" }}
          >
            Akzeptieren
          </button>
        </div>
      </div>
    </div>
  );
}
