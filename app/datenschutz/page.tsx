import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Datenschutzerklärung — Galley Book",
};

export default function DatenschutzPage() {
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

        <h1 className="text-4xl font-thin text-anthracite mb-2">
          Datenschutzerklärung
        </h1>
        <p className="text-xs font-light text-on-surface-variant mb-10">
          Stand: April 2026
        </p>

        {/* 1. Verantwortlicher */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            1. Verantwortlicher
          </h2>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed">
            Verantwortlich für die Datenverarbeitung auf dieser Website im Sinne
            der DSGVO ist:
          </p>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed mt-3">
            Tim Meyerdierks
            <br />
            Sonnenburgerstr. 54
            <br />
            10437 Berlin
            <br />
            Deutschland
            <br />
            E-Mail:{" "}
            <a
              href="mailto:contact@galleybook.com"
              className="underline underline-offset-2"
            >
              contact@galleybook.com
            </a>
          </p>
        </section>

        {/* 2. Erhobene Daten */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            2. Welche Daten wir verarbeiten
          </h2>
          <div className="space-y-4">
            {[
              {
                title: "Kontodaten",
                text: "Name, E-Mail-Adresse und Profilfoto, die Google bei der Anmeldung übermittelt. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).",
              },
              {
                title: "Rezepte und Inhalte",
                text: "Rezeptnamen, Zutaten, Zubereitungsschritte und Fotos, die du eingibst oder importierst. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.",
              },
              {
                title: "Wartelisten-E-Mail",
                text: "Wenn du dich auf die Warteliste einträgst, speichern wir deine E-Mail-Adresse ausschließlich zur Benachrichtigung bei App-Start. Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO (Einwilligung). Du kannst die Einwilligung jederzeit per E-Mail an contact@galleybook.com widerrufen.",
              },
              {
                title: "Server-Logs",
                text: "Beim Aufruf unserer Website speichert der Hosting-Anbieter automatisch IP-Adresse, Datum/Uhrzeit und aufgerufene URL für max. 7 Tage. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an IT-Sicherheit).",
              },
            ].map((item) => (
              <div key={item.title} className="bg-surface-low rounded-md px-4 py-3">
                <p className="text-sm font-semibold text-anthracite mb-1">
                  {item.title}
                </p>
                <p className="text-sm font-light text-on-surface-variant leading-relaxed">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* 3. Dienstleister */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            3. Eingesetzte Dienstleister (Auftragsverarbeiter)
          </h2>
          <div className="space-y-4">
            {[
              {
                name: "Supabase Inc.",
                role: "Datenbank, Authentifizierung, Datei-Speicher",
                detail:
                  "Alle App-Daten (Rezepte, Konten, Fotos) werden auf Supabase-Servern gespeichert. Datenübertragung in die USA auf Basis von Standardvertragsklauseln (SCCs).",
                link: "https://supabase.com/privacy",
              },
              {
                name: "Google LLC",
                role: "Anmeldung via OAuth",
                detail:
                  "Beim Login via \u201EMit Google anmelden\u201C erhalten wir Name, E-Mail und Profilfoto von Google. Datenübertragung in die USA auf Basis von SCCs.",
                link: "https://policies.google.com/privacy",
              },
              {
                name: "Vercel Inc.",
                role: "Hosting und CDN",
                detail:
                  "Die Website wird auf Vercel-Servern gehostet. Vercel verarbeitet Server-Logs bei jedem Seitenaufruf. Datenübertragung in die USA auf Basis von SCCs.",
                link: "https://vercel.com/legal/privacy-policy",
              },
              {
                name: "Anthropic PBC",
                role: "KI-Rezeptextraktion",
                detail:
                  "Beim Import eines Rezepts via URL oder Foto wird der Seiteninhalt bzw. das Bild an Anthropic zur Verarbeitung gesendet. Anthropic kann Eingaben bis zu 30 Tage für Sicherheitsmonitoring speichern. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.",
                link: "https://www.anthropic.com/privacy",
              },
              {
                name: "Perplexity AI Inc.",
                role: "Web-Suche für Rezeptinhalte und Empfehlungen",
                detail:
                  "Für bestimmte Importe (z. B. Instagram, YouTube) und die Entdecken-Funktion werden Metadaten deiner gespeicherten Quellen an Perplexity gesendet. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.",
                link: "https://www.perplexity.ai/privacy",
              },
            ].map((svc) => (
              <div key={svc.name} className="bg-surface-low rounded-md px-4 py-3">
                <p className="text-sm font-semibold text-anthracite mb-0.5">
                  {svc.name}{" "}
                  <span className="font-light text-on-surface-variant">
                    — {svc.role}
                  </span>
                </p>
                <p className="text-xs font-light text-on-surface-variant leading-relaxed mb-1">
                  {svc.detail}
                </p>
                <a
                  href={svc.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-light text-on-surface-variant/70 underline underline-offset-2"
                >
                  Datenschutzerklärung des Anbieters
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* 4. Meta Pixel */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            4. Meta Pixel (Facebook)
          </h2>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed mb-3">
            Auf unserer Landingpage setzen wir den Meta Pixel der Meta Platforms
            Ireland Ltd., 4 Grand Canal Square, Dublin 2, Irland ein.
          </p>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed mb-3">
            Beim Besuch der Seite wird automatisch ein JavaScript-Code geladen,
            der Informationen über dein Gerät und dein Verhalten (aufgerufene
            Seite, ggf. durchgeführte Aktionen wie Registrierung) an Meta
            übermittelt. Diese Daten können von Meta genutzt werden, um
            personalisierte Werbung zu schalten und Zielgruppen aufzubauen.
          </p>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed mb-3">
            Folgende Ereignisse werden getrackt:
          </p>
          <ul className="list-disc list-outside ml-5 space-y-1 text-sm font-light text-on-surface-variant mb-3">
            <li>
              <span className="font-normal text-anthracite">PageView</span> —
              beim Aufruf der Landingpage
            </li>
            <li>
              <span className="font-normal text-anthracite">SignUp</span> — bei
              erfolgreicher Registrierung
            </li>
          </ul>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed mb-3">
            Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO i. V. m. §25 Abs. 1
            TTDSG (Einwilligung). Du wirst beim ersten Besuch der Landingpage
            um deine Einwilligung gebeten. Du kannst diese jederzeit widerrufen,
            indem du den Browserspeicher (localStorage) unter dem Schlüssel{" "}
            <code className="text-xs bg-surface-low px-1 py-0.5 rounded">
              galley-cookie-consent
            </code>{" "}
            löschst oder uns unter{" "}
            <a
              href="mailto:contact@galleybook.com"
              className="underline underline-offset-2"
            >
              contact@galleybook.com
            </a>{" "}
            kontaktierst.
          </p>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed">
            Daten werden ggf. in die USA übertragen (Muttergesellschaft Meta
            Platforms Inc.). Grundlage: Standardvertragsklauseln (SCCs).
            Datenschutzerklärung von Meta:{" "}
            <a
              href="https://www.facebook.com/privacy/policy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              facebook.com/privacy/policy
            </a>
          </p>
        </section>

        {/* 5. Cookies */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            5. Cookies
          </h2>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed">
            Wir setzen ein technisch notwendiges Session-Cookie ein, das dich
            eingeloggt hält (Supabase Auth). Dieses Cookie ist für die
            Funktionsfähigkeit der App erforderlich. Der Meta Pixel (siehe
            Abschnitt 4) wird nur nach deiner ausdrücklichen Einwilligung über
            das Cookie-Banner auf der Landingpage geladen und setzt dann eigene
            Cookies von Meta. Ohne Einwilligung werden keine Tracking-Cookies
            gesetzt.
          </p>
        </section>

        {/* 6. Deine Rechte */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            6. Deine Rechte (DSGVO)
          </h2>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed mb-3">
            Du hast gegenüber uns folgende Rechte bezüglich deiner
            personenbezogenen Daten:
          </p>
          <ul className="list-disc list-outside ml-5 space-y-2 text-sm font-light text-on-surface-variant">
            <li>
              <span className="font-normal text-anthracite">
                Recht auf Auskunft
              </span>{" "}
              (Art. 15 DSGVO)
            </li>
            <li>
              <span className="font-normal text-anthracite">
                Recht auf Berichtigung
              </span>{" "}
              (Art. 16 DSGVO) — Namensänderung direkt in den Einstellungen möglich
            </li>
            <li>
              <span className="font-normal text-anthracite">
                Recht auf Löschung
              </span>{" "}
              (Art. 17 DSGVO) — Konto und alle Daten jederzeit unter Einstellungen
              → Konto löschen
            </li>
            <li>
              <span className="font-normal text-anthracite">
                Recht auf Einschränkung der Verarbeitung
              </span>{" "}
              (Art. 18 DSGVO)
            </li>
            <li>
              <span className="font-normal text-anthracite">
                Recht auf Datenübertragbarkeit
              </span>{" "}
              (Art. 20 DSGVO) — Rezeptexport auf Anfrage per E-Mail
            </li>
            <li>
              <span className="font-normal text-anthracite">
                Widerspruchsrecht
              </span>{" "}
              (Art. 21 DSGVO) — insbesondere gegen Verarbeitung auf Basis
              berechtigten Interesses (z. B. Meta Pixel)
            </li>
          </ul>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed mt-3">
            Zur Ausübung deiner Rechte wende dich an:{" "}
            <a
              href="mailto:contact@galleybook.com"
              className="underline underline-offset-2"
            >
              contact@galleybook.com
            </a>
          </p>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed mt-3">
            Du hast außerdem das Recht, dich bei einer Datenschutz-Aufsichtsbehörde
            zu beschweren. Die zuständige Behörde richtet sich nach deinem
            Wohnort.
          </p>
        </section>

        {/* Footer */}
        <div className="pt-8 border-t border-surface-low">
          <p className="text-xs font-light text-on-surface-variant">
            Siehe auch:{" "}
            <Link href="/impressum" className="underline underline-offset-2">
              Impressum
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
