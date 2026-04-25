import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Impressum — Galley Book",
};

export default function ImpressumPage() {
  return (
    <div className="min-h-screen bg-white px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-light text-on-surface-variant mb-10"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M9 11L5 7l4-4"
              stroke="#474747"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Zurück
        </Link>

        <h1 className="text-4xl font-thin text-anthracite mb-10">Impressum</h1>

        {/* Angaben gemäß §5 TMG */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            Angaben gemäß §5 TMG
          </h2>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed">
            Tim Meyerdierks
            <br />
            Sonnenburgerstr. 54
            <br />
            10437 Berlin
            <br />
            Deutschland
          </p>
        </section>

        {/* Kontakt */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            Kontakt
          </h2>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed">
            E-Mail:{" "}
            <a
              href="mailto:contact@galleybook.com"
              className="underline underline-offset-2"
            >
              contact@galleybook.com
            </a>
          </p>
        </section>

        {/* Verantwortlich für den Inhalt */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            Verantwortlich für den Inhalt nach §18 Abs. 2 MStV
          </h2>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed">
            Tim Meyerdierks
            <br />
            (Anschrift wie oben)
          </p>
        </section>

        {/* Haftungsausschluss */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            Haftungsausschluss
          </h2>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed mb-3">
            Die Inhalte dieser Website wurden mit größtmöglicher Sorgfalt
            erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität der
            Inhalte übernehmen wir keine Gewähr. Als Diensteanbieter sind wir
            für eigene Inhalte nach §7 Abs. 1 TMG verantwortlich. Nach §§8 bis
            10 TMG sind wir als Diensteanbieter jedoch nicht verpflichtet,
            übermittelte oder gespeicherte fremde Informationen zu überwachen.
          </p>
        </section>

        {/* Urheberrecht */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            Urheberrecht
          </h2>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed">
            Die durch den Seitenbetreiber erstellten Inhalte und Werke auf
            dieser Website unterliegen dem deutschen Urheberrecht. Die
            Vervielfältigung, Bearbeitung, Verbreitung und jede Art der
            Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der
            schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers.
          </p>
        </section>

        {/* Footer */}
        <div className="pt-8 border-t border-surface-low">
          <p className="text-xs font-light text-on-surface-variant">
            Siehe auch:{" "}
            <Link href="/datenschutz" className="underline underline-offset-2">
              Datenschutzerklärung
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
