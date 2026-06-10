"use client";

import { useEffect, useState, FormEvent } from "react";
import Image from "next/image";

// Android is in closed testing only (GAL-275 / GAL-77). This page gives Android
// visitors two paths: join the launch waitlist, or get free early access now by
// becoming a closed tester. When the Play Store listing goes live, fold this
// into the normal install CTA — tracked in GAL-443.

const GROUP_URL = "https://groups.google.com/g/galleybook-android-testers";
const OPT_IN_URL = "https://play.google.com/apps/testing/com.galleyworks.galleybook";

type Lang = "en" | "de" | "fr" | "es" | "it" | "pl";

const copy = {
  en: {
    back: "Back to home",
    badge: "Android — early access",
    heading: "galleybook is coming\nto Android.",
    sub: "We're in closed testing right now. Get notified the moment we launch — or skip the queue and test it free today.",
    notify: {
      title: "Notify me at launch",
      body: "We'll email you the moment galleybook is live on Google Play. No spam, just the one message.",
      placeholder: "you@email.com",
      button: "Join the waitlist",
      sending: "Joining…",
      success: "You're on the list — we'll be in touch at launch.",
      error: "Something went wrong. Please try again.",
    },
    testers: {
      title: "Get free early access now",
      body: "Become a closed tester and use galleybook on Android today — free while we're in beta.",
      steps: [
        "Join the testers group, then tap Join group.",
        "Open the Play testing page and tap Become a tester.",
        "On the confirmation page, tap Download it on Google Play, then Install.",
      ],
      note: "If it says “Not found”, wait ~30–60 min and tap Install again — a new release is still propagating.",
      joinGroup: "1. Join the testers group",
      optIn: "2. Become a tester",
    },
  },
  de: {
    back: "Zur Startseite",
    badge: "Android — Früher Zugang",
    heading: "galleybook kommt\nfür Android.",
    sub: "Wir sind gerade in der geschlossenen Testphase. Lass dich zum Start benachrichtigen — oder überspring die Warteschlange und teste es heute kostenlos.",
    notify: {
      title: "Zum Start benachrichtigen",
      body: "Wir mailen dir, sobald galleybook bei Google Play verfügbar ist. Kein Spam, nur diese eine Nachricht.",
      placeholder: "du@email.com",
      button: "Auf die Warteliste",
      sending: "Wird eingetragen…",
      success: "Du bist auf der Liste — wir melden uns zum Start.",
      error: "Etwas ist schiefgelaufen. Bitte versuch es erneut.",
    },
    testers: {
      title: "Jetzt kostenlosen Zugang sichern",
      body: "Werde Closed-Tester und nutze galleybook heute auf Android — kostenlos während der Beta.",
      steps: [
        "Tritt der Tester-Gruppe bei und tippe auf Gruppe beitreten.",
        "Öffne die Play-Testseite und tippe auf Tester werden.",
        "Tippe auf der Bestätigungsseite auf Bei Google Play herunterladen und dann auf Installieren.",
      ],
      note: "Falls „Nicht gefunden“ erscheint, warte ~30–60 Min. und tippe erneut auf Installieren — eine neue Version wird noch verteilt.",
      joinGroup: "1. Der Tester-Gruppe beitreten",
      optIn: "2. Tester werden",
    },
  },
  fr: {
    back: "Retour à l'accueil",
    badge: "Android — accès anticipé",
    heading: "galleybook arrive\nsur Android.",
    sub: "Nous sommes en test fermé pour le moment. Soyez prévenu·e dès le lancement — ou doublez la file et testez-le gratuitement dès aujourd'hui.",
    notify: {
      title: "Me prévenir au lancement",
      body: "Nous vous écrirons dès que galleybook sera disponible sur Google Play. Pas de spam, juste ce message.",
      placeholder: "vous@email.com",
      button: "Rejoindre la liste",
      sending: "Inscription…",
      success: "Vous êtes sur la liste — on vous écrit au lancement.",
      error: "Une erreur est survenue. Veuillez réessayer.",
    },
    testers: {
      title: "Accès anticipé gratuit maintenant",
      body: "Devenez testeur·euse fermé·e et utilisez galleybook sur Android dès aujourd'hui — gratuit pendant la bêta.",
      steps: [
        "Rejoignez le groupe de testeurs, puis touchez Rejoindre le groupe.",
        "Ouvrez la page de test Play et touchez Devenir testeur.",
        "Sur la page de confirmation, touchez Télécharger sur Google Play, puis Installer.",
      ],
      note: "Si « Introuvable » s'affiche, attendez ~30–60 min et touchez à nouveau Installer — une nouvelle version est encore en cours de diffusion.",
      joinGroup: "1. Rejoindre le groupe de testeurs",
      optIn: "2. Devenir testeur",
    },
  },
  es: {
    back: "Volver al inicio",
    badge: "Android — acceso anticipado",
    heading: "galleybook llega\na Android.",
    sub: "Ahora mismo estamos en pruebas cerradas. Te avisamos en cuanto lancemos — o sáltate la cola y pruébalo gratis hoy.",
    notify: {
      title: "Avísame en el lanzamiento",
      body: "Te escribiremos en cuanto galleybook esté disponible en Google Play. Sin spam, solo ese mensaje.",
      placeholder: "tu@email.com",
      button: "Unirme a la lista",
      sending: "Uniéndote…",
      success: "Estás en la lista — te avisaremos en el lanzamiento.",
      error: "Algo salió mal. Inténtalo de nuevo.",
    },
    testers: {
      title: "Consigue acceso anticipado gratis",
      body: "Hazte tester cerrado y usa galleybook en Android hoy — gratis mientras estamos en beta.",
      steps: [
        "Únete al grupo de testers y toca Unirse al grupo.",
        "Abre la página de pruebas de Play y toca Convertirse en tester.",
        "En la página de confirmación, toca Descargar en Google Play y luego Instalar.",
      ],
      note: "Si dice «No encontrado», espera ~30–60 min y vuelve a tocar Instalar — una nueva versión aún se está propagando.",
      joinGroup: "1. Unirse al grupo de testers",
      optIn: "2. Convertirse en tester",
    },
  },
  it: {
    back: "Torna alla home",
    badge: "Android — accesso anticipato",
    heading: "galleybook arriva\nsu Android.",
    sub: "Al momento siamo in test chiuso. Fatti avvisare al lancio — oppure salta la fila e provalo gratis oggi.",
    notify: {
      title: "Avvisami al lancio",
      body: "Ti scriviamo appena galleybook sarà su Google Play. Niente spam, solo questo messaggio.",
      placeholder: "tu@email.com",
      button: "Iscriviti alla lista",
      sending: "Iscrizione…",
      success: "Sei in lista — ti avvisiamo al lancio.",
      error: "Qualcosa è andato storto. Riprova.",
    },
    testers: {
      title: "Ottieni subito l'accesso gratuito",
      body: "Diventa tester chiuso e usa galleybook su Android oggi — gratis durante la beta.",
      steps: [
        "Unisciti al gruppo dei tester, poi tocca Unisciti al gruppo.",
        "Apri la pagina di test di Play e tocca Diventa tester.",
        "Nella pagina di conferma, tocca Scarica su Google Play, poi Installa.",
      ],
      note: "Se compare «Non trovato», attendi ~30–60 min e tocca di nuovo Installa — una nuova versione è ancora in distribuzione.",
      joinGroup: "1. Unisciti al gruppo dei tester",
      optIn: "2. Diventa tester",
    },
  },
  pl: {
    back: "Powrót do strony głównej",
    badge: "Android — wczesny dostęp",
    heading: "galleybook już wkrótce\nna Androida.",
    sub: "Jesteśmy teraz w zamkniętych testach. Daj się powiadomić w dniu startu — albo pomiń kolejkę i przetestuj za darmo już dziś.",
    notify: {
      title: "Powiadom mnie przy starcie",
      body: "Napiszemy, gdy tylko galleybook pojawi się w Google Play. Bez spamu, tylko ta jedna wiadomość.",
      placeholder: "ty@email.com",
      button: "Dołącz do listy",
      sending: "Zapisywanie…",
      success: "Jesteś na liście — odezwiemy się przy starcie.",
      error: "Coś poszło nie tak. Spróbuj ponownie.",
    },
    testers: {
      title: "Zdobądź darmowy wczesny dostęp",
      body: "Zostań testerem zamkniętym i korzystaj z galleybook na Androidzie już dziś — za darmo w trakcie bety.",
      steps: [
        "Dołącz do grupy testerów, a następnie kliknij Dołącz do grupy.",
        "Otwórz stronę testów Play i kliknij Zostań testerem.",
        "Na stronie potwierdzenia kliknij Pobierz z Google Play, a potem Zainstaluj.",
      ],
      note: "Jeśli pojawi się „Nie znaleziono”, odczekaj ~30–60 min i kliknij Zainstaluj ponownie — nowa wersja wciąż się propaguje.",
      joinGroup: "1. Dołącz do grupy testerów",
      optIn: "2. Zostań testerem",
    },
  },
};

function IconAndroid() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 9v8a1 1 0 0 0 1 1h1v3a1 1 0 0 0 2 0v-3h4v3a1 1 0 0 0 2 0v-3h1a1 1 0 0 0 1-1V9H6zM4.5 9A1.5 1.5 0 0 0 3 10.5v4a1.5 1.5 0 0 0 3 0v-4A1.5 1.5 0 0 0 4.5 9zm15 0a1.5 1.5 0 0 0-1.5 1.5v4a1.5 1.5 0 0 0 3 0v-4A1.5 1.5 0 0 0 19.5 9zM15.6 3.2l1.1-1.6a.3.3 0 0 0-.5-.34l-1.2 1.7a6.5 6.5 0 0 0-5 0L8.8 1.26a.3.3 0 0 0-.5.34l1.1 1.6A5.7 5.7 0 0 0 6 8h12a5.7 5.7 0 0 0-2.4-4.8zM9.5 6.2a.7.7 0 1 1 0-1.4.7.7 0 0 1 0 1.4zm5 0a.7.7 0 1 1 0-1.4.7.7 0 0 1 0 1.4z" />
    </svg>
  );
}

function IconArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

export default function AndroidPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("lang");
    if (p && p in copy) setLang(p as Lang);
  }, []);

  const t = copy[lang];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === "sending" || status === "done") return;
    setStatus("sending");
    try {
      const res = await fetch("/api/android-waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, locale: lang }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white font-sans">
      <header className="flex items-center justify-between gap-4 px-6 py-5 md:px-16">
        <a href="/" className="select-none flex items-end gap-3">
          <Image src="/logo.png" alt="galleybook" width={40} height={32} className="object-contain" />
        </a>
        <a
          href="/"
          className="px-4 py-2 rounded-full text-sm font-light border border-anthracite text-anthracite transition-opacity hover:opacity-70 whitespace-nowrap"
        >
          {t.back}
        </a>
      </header>

      <main className="flex-1 px-6 md:px-16 pt-10 pb-24">
        <div className="max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-anthracite/20 bg-surface-low mb-8">
            <IconAndroid />
            <span className="text-xs font-semibold uppercase tracking-widest text-anthracite/60">
              {t.badge}
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-thin text-anthracite leading-[1.05] mb-6 whitespace-pre-line">
            {t.heading}
          </h1>
          <p className="text-base md:text-lg font-light text-on-surface-variant max-w-xl mb-12 leading-relaxed">
            {t.sub}
          </p>

          <div className="grid gap-5 md:grid-cols-2 max-w-4xl">
            {/* Path A — waitlist */}
            <div className="bg-surface-lowest rounded-md px-6 py-7 shadow-ambient flex flex-col">
              <h2 className="text-xl font-light text-anthracite mb-2">{t.notify.title}</h2>
              <p className="text-sm font-light text-on-surface-variant mb-6 leading-relaxed">
                {t.notify.body}
              </p>

              {status === "done" ? (
                <p className="mt-auto text-sm font-light text-anthracite">{t.notify.success}</p>
              ) : (
                <form onSubmit={onSubmit} className="mt-auto flex flex-col gap-3">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t.notify.placeholder}
                    className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none"
                  />
                  <button
                    type="submit"
                    disabled={status === "sending"}
                    className="border text-sm font-light py-3 rounded-full transition-opacity hover:opacity-80 disabled:opacity-40"
                    style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
                  >
                    {status === "sending" ? t.notify.sending : t.notify.button}
                  </button>
                  {status === "error" && (
                    <p className="text-xs font-light text-red-500">{t.notify.error}</p>
                  )}
                </form>
              )}
            </div>

            {/* Path B — become a tester */}
            <div className="bg-surface-lowest rounded-md px-6 py-7 shadow-ambient flex flex-col">
              <h2 className="text-xl font-light text-anthracite mb-2">{t.testers.title}</h2>
              <p className="text-sm font-light text-on-surface-variant mb-5 leading-relaxed">
                {t.testers.body}
              </p>

              <ol className="flex flex-col gap-2 mb-6">
                {t.testers.steps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm font-light text-anthracite leading-relaxed">
                    <span className="text-anthracite/40">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>

              <p className="text-xs font-light text-on-surface-variant/80 mb-6 leading-relaxed">
                {t.testers.note}
              </p>

              <div className="mt-auto flex flex-col gap-3">
                <a
                  href={GROUP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 border text-sm font-light py-3 rounded-full transition-opacity hover:opacity-70"
                  style={{ backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }}
                >
                  {t.testers.joinGroup}
                  <IconArrow />
                </a>
                <a
                  href={OPT_IN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 border text-sm font-light py-3 rounded-full transition-opacity hover:opacity-80"
                  style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
                >
                  {t.testers.optIn}
                  <IconArrow />
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
