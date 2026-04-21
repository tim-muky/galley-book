"use client";

import { useState } from "react";

const copy = {
  en: {
    headline: "Your Family's\nCulinary Gallery",
    sub: "A private recipe library for the people you cook for.",
    inputPlaceholder: "your@email.com",
    cta: "Join the waitlist",
    ctaPending: "Joining…",
    ctaDone: "You're on the list",
    features: [
      {
        title: "Save from anywhere",
        body: "Import from Instagram, YouTube, TikTok, or any recipe website. Our AI parses every detail in seconds.",
      },
      {
        title: "Cook together",
        body: "Share a Galley with family or friends. One library, everyone's recipes — beautifully organised.",
      },
      {
        title: "Discover what's next",
        body: "Get AI-curated recommendations from sources you love. Tap to add directly to your Galley.",
      },
    ],
    footerLinks: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
  de: {
    headline: "Die Kochbuch-Galerie\ndeiner Familie",
    sub: "Eine private Rezeptbibliothek für die Menschen, für die du kochst.",
    inputPlaceholder: "deine@email.de",
    cta: "Auf die Warteliste",
    ctaPending: "Eintragen…",
    ctaDone: "Du bist dabei",
    features: [
      {
        title: "Von überall speichern",
        body: "Importiere von Instagram, YouTube, TikTok oder jeder Rezeptwebsite. Unsere KI erfasst alle Details in Sekunden.",
      },
      {
        title: "Gemeinsam kochen",
        body: "Teile eine Galley mit Familie oder Freunden. Eine Bibliothek, alle Rezepte — wunderschön organisiert.",
      },
      {
        title: "Was als nächstes?",
        body: "KI-kuratierte Empfehlungen aus Quellen, die du liebst. Tippe, um sie direkt in deine Galley aufzunehmen.",
      },
    ],
    footerLinks: [
      { label: "Datenschutz", href: "/privacy" },
      { label: "Nutzungsbedingungen", href: "/terms" },
    ],
  },
};

type Lang = "en" | "de";

export default function LandingPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "pending" | "done" | "error">("idle");
  const t = copy[lang];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status !== "idle") return;
    setStatus("pending");

    const res = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setStatus(res.ok ? "done" : "error");
  }

  return (
    <div className="min-h-screen flex flex-col bg-white font-[family-name:var(--font-inter)]">
      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-5 md:px-12">
        <span
          className="text-sm font-semibold tracking-widest uppercase"
          style={{ color: "#252729" }}
        >
          Galley Book
        </span>

        {/* Language toggle */}
        <div className="flex items-center gap-1 border rounded-full px-1 py-1" style={{ borderColor: "#252729" }}>
          {(["en", "de"] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-widest transition-colors"
              style={
                lang === l
                  ? { backgroundColor: "#252729", color: "#fff" }
                  : { backgroundColor: "transparent", color: "#252729" }
              }
            >
              {l}
            </button>
          ))}
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 md:py-28 text-center">
        <h1
          className="text-5xl md:text-7xl font-thin leading-tight mb-6 whitespace-pre-line"
          style={{ color: "#252729" }}
        >
          {t.headline}
        </h1>

        <p
          className="text-base md:text-lg font-light max-w-md mb-12"
          style={{ color: "#474747", lineHeight: 1.6 }}
        >
          {t.sub}
        </p>

        {/* Waitlist form */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-col sm:flex-row gap-3 w-full max-w-md"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.inputPlaceholder}
            disabled={status !== "idle"}
            className="flex-1 px-5 py-3 rounded-full text-sm font-light outline-none disabled:opacity-40"
            style={{
              backgroundColor: "#F3F3F4",
              color: "#252729",
            }}
          />
          <button
            type="submit"
            disabled={status !== "idle"}
            className="px-6 py-3 rounded-full text-sm font-light border transition-opacity disabled:opacity-40 whitespace-nowrap"
            style={{
              backgroundColor: status === "done" ? "#fff" : "#252729",
              color: status === "done" ? "#252729" : "#fff",
              borderColor: "#252729",
            }}
          >
            {status === "pending"
              ? t.ctaPending
              : status === "done"
              ? t.ctaDone
              : t.cta}
          </button>
        </form>

        {status === "error" && (
          <p className="mt-3 text-xs font-light" style={{ color: "#474747" }}>
            Something went wrong — please try again.
          </p>
        )}
      </main>

      {/* Features */}
      <section className="px-6 pb-20 md:px-12">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8">
          {t.features.map((f) => (
            <div key={f.title}>
              <p
                className="text-sm font-semibold mb-2"
                style={{ color: "#252729" }}
              >
                {f.title}
              </p>
              <p
                className="text-sm font-light leading-relaxed"
                style={{ color: "#474747" }}
              >
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer
        className="px-6 py-6 md:px-12 flex items-center justify-between"
        style={{ borderTop: "1px solid #F3F3F4" }}
      >
        <span className="text-xs font-light" style={{ color: "#474747" }}>
          © {new Date().getFullYear()} Galley Book
        </span>
        <div className="flex gap-4">
          {t.footerLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-xs font-light"
              style={{ color: "#474747" }}
            >
              {l.label}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}
