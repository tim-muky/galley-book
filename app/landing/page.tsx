"use client";

import { useState, ReactElement } from "react";
import Image from "next/image";
import { ConsentBanner, hasConsent } from "./consent-banner";

const copy = {
  en: {
    nav: { signIn: "Sign in" },
    hero: {
      tag: "AI-powered recipe saving",
      headline1: "Save recipes from",
      headline2: "everywhere.",
      headline3: "Take them wherever",
      headline4: "you go.",
      sub: "galleybook imports any recipe from Instagram, YouTube, TikTok, or any website in seconds — and keeps your whole collection beautifully organised, always with you.",
      inputPlaceholder: "your@email.com",
      cta: "Join the waitlist",
      ctaPending: "Joining…",
      ctaDone: "You're on the list ✓",
      ctaError: "Something went wrong — please try again.",
      ctaNote: "Free to join. No spam.",
    },
    features: {
      label: "What you get",
      heading: "Every recipe,\never source, one place.",
      items: [
        {
          icon: "link",
          title: "Save from anywhere",
          body: "Paste any URL — Instagram post, YouTube video, TikTok, or recipe website. Our AI parses the full recipe in seconds: ingredients, steps, photos and all.",
        },
        {
          icon: "phone",
          title: "Always with you",
          body: "Your recipes live in your pocket. Browse, search, and cook from your phone — even offline. No more lost bookmarks or screenshot folders.",
        },
        {
          icon: "users",
          title: "Cook together",
          body: "Share a Galley with your family or friends. One library, everyone's contributions — perfectly organised so no recipe ever gets lost.",
        },
        {
          icon: "sparkles",
          title: "AI-powered discovery",
          body: "Get personalised recipe suggestions curated from the sources you love. Tap to add directly to your Galley — no copy-pasting.",
        },
      ],
    },
    how: {
      label: "How it works",
      heading: "Three steps to your\nperfect recipe collection.",
      steps: [
        {
          num: "01",
          title: "Share a link",
          body: "Copy any recipe URL — from Instagram, YouTube, TikTok, or your favourite food blog. Paste it into galleybook.",
        },
        {
          num: "02",
          title: "AI does the rest",
          body: "Our AI extracts every detail: ingredients with quantities, step-by-step instructions, cook time, and photos.",
        },
        {
          num: "03",
          title: "Cook & share",
          body: "Your recipe is saved and ready. Cook from it, share it with your Galley, and build your personal collection.",
        },
      ],
    },
    sources: {
      label: "Works with",
    },
    cta2: {
      heading: "Your recipes deserve\na better home.",
      sub: "Join the waitlist and be the first to know when galleybook opens.",
      inputPlaceholder: "your@email.com",
      cta: "Get early access",
      ctaPending: "Joining…",
      ctaDone: "You're on the list ✓",
      ctaNote: "Free to join. No credit card required.",
    },
    footer: {
      copy: `© ${new Date().getFullYear()} galleybook`,
      links: [
        { label: "Privacy", href: "/privacy" },
        { label: "Terms", href: "/terms" },
        { label: "Impressum", href: "/impressum" },
      ],
    },
  },
  de: {
    nav: { signIn: "Anmelden" },
    hero: {
      tag: "KI-gestütztes Rezepte-Speichern",
      headline1: "Rezepte von",
      headline2: "überall speichern.",
      headline3: "Überall dabei",
      headline4: "haben.",
      sub: "galleybook importiert jedes Rezept von Instagram, YouTube, TikTok oder jeder Website in Sekunden — und hält deine gesamte Sammlung wunderschön organisiert, immer mit dir.",
      inputPlaceholder: "deine@email.de",
      cta: "Auf die Warteliste",
      ctaPending: "Eintragen…",
      ctaDone: "Du bist dabei ✓",
      ctaError: "Etwas ist schiefgelaufen — bitte erneut versuchen.",
      ctaNote: "Kostenlos. Kein Spam.",
    },
    features: {
      label: "Was du bekommst",
      heading: "Jedes Rezept,\njede Quelle, ein Ort.",
      items: [
        {
          icon: "link",
          title: "Von überall speichern",
          body: "Füge eine beliebige URL ein — Instagram, YouTube, TikTok oder eine Rezeptwebsite. Unsere KI parst das vollständige Rezept in Sekunden.",
        },
        {
          icon: "phone",
          title: "Immer dabei",
          body: "Deine Rezepte sind immer in deiner Tasche. Stöbere, suche und koche von deinem Handy — auch offline. Keine verlorenen Lesezeichen mehr.",
        },
        {
          icon: "users",
          title: "Gemeinsam kochen",
          body: "Teile eine Galley mit deiner Familie oder Freunden. Eine Bibliothek, aller Beiträge — perfekt organisiert.",
        },
        {
          icon: "sparkles",
          title: "KI-gestützte Entdeckung",
          body: "Erhalte personalisierte Rezeptvorschläge aus den Quellen, die du liebst. Tippe, um sie direkt zu deiner Galley hinzuzufügen.",
        },
      ],
    },
    how: {
      label: "So funktioniert es",
      heading: "Drei Schritte zur\nperfekten Rezeptsammlung.",
      steps: [
        {
          num: "01",
          title: "Link teilen",
          body: "Kopiere eine beliebige Rezept-URL — von Instagram, YouTube, TikTok oder deinem Lieblings-Foodblog. Füge sie in galleybook ein.",
        },
        {
          num: "02",
          title: "KI erledigt den Rest",
          body: "Unsere KI extrahiert jedes Detail: Zutaten mit Mengen, Schritt-für-Schritt-Anweisungen, Kochzeit und Fotos.",
        },
        {
          num: "03",
          title: "Kochen & teilen",
          body: "Dein Rezept ist gespeichert und bereit. Koche danach, teile es mit deiner Galley und baue deine persönliche Sammlung auf.",
        },
      ],
    },
    sources: {
      label: "Funktioniert mit",
    },
    cta2: {
      heading: "Deine Rezepte verdienen\nein besseres Zuhause.",
      sub: "Trage dich auf die Warteliste ein und erfahre als Erste, wenn galleybook öffnet.",
      inputPlaceholder: "deine@email.de",
      cta: "Frühen Zugang sichern",
      ctaPending: "Eintragen…",
      ctaDone: "Du bist dabei ✓",
      ctaNote: "Kostenlos. Keine Kreditkarte erforderlich.",
    },
    footer: {
      copy: `© ${new Date().getFullYear()} galleybook`,
      links: [
        { label: "Impressum", href: "/impressum" },
        { label: "Datenschutz", href: "/datenschutz" },
      ],
    },
  },
  fr: {
    nav: { signIn: "Se connecter" },
    hero: {
      tag: "Sauvegarde de recettes par IA",
      headline1: "Sauvegardez des recettes",
      headline2: "partout.",
      headline3: "Emportez-les",
      headline4: "où vous voulez.",
      sub: "galleybook importe n'importe quelle recette depuis Instagram, YouTube, TikTok ou n'importe quel site en quelques secondes — et garde toute votre collection magnifiquement organisée, toujours avec vous.",
      inputPlaceholder: "votre@email.fr",
      cta: "Rejoindre la liste d'attente",
      ctaPending: "Inscription…",
      ctaDone: "Vous êtes sur la liste ✓",
      ctaError: "Une erreur est survenue — veuillez réessayer.",
      ctaNote: "Gratuit. Pas de spam.",
    },
    features: {
      label: "Ce que vous obtenez",
      heading: "Chaque recette,\nchaque source, un seul endroit.",
      items: [
        { icon: "link", title: "Sauvegarder de partout", body: "Collez n'importe quelle URL — Instagram, YouTube, TikTok ou site de recettes. Notre IA analyse la recette complète en quelques secondes." },
        { icon: "phone", title: "Toujours avec vous", body: "Vos recettes vivent dans votre poche. Parcourez, cherchez et cuisinez depuis votre téléphone — même hors ligne." },
        { icon: "users", title: "Cuisiner ensemble", body: "Partagez une Galley avec votre famille ou vos amis. Une bibliothèque, les contributions de tous — parfaitement organisée." },
        { icon: "sparkles", title: "Découverte par IA", body: "Obtenez des suggestions de recettes personnalisées issues des sources que vous aimez. Ajoutez directement à votre Galley." },
      ],
    },
    how: {
      label: "Comment ça marche",
      heading: "Trois étapes vers votre\ncollection de recettes idéale.",
      steps: [
        { num: "01", title: "Partagez un lien", body: "Copiez n'importe quelle URL de recette — depuis Instagram, YouTube, TikTok ou votre blog culinaire préféré. Collez-la dans galleybook." },
        { num: "02", title: "L'IA fait le reste", body: "Notre IA extrait chaque détail : ingrédients avec quantités, instructions étape par étape, temps de cuisson et photos." },
        { num: "03", title: "Cuisinez & partagez", body: "Votre recette est sauvegardée et prête. Cuisinez d'après elle, partagez-la avec votre Galley et construisez votre collection personnelle." },
      ],
    },
    sources: { label: "Compatible avec" },
    cta2: {
      heading: "Vos recettes méritent\nune meilleure maison.",
      sub: "Rejoignez la liste d'attente et soyez les premiers informés à l'ouverture de galleybook.",
      inputPlaceholder: "votre@email.fr",
      cta: "Accès anticipé",
      ctaPending: "Inscription…",
      ctaDone: "Vous êtes sur la liste ✓",
      ctaNote: "Gratuit. Aucune carte de crédit requise.",
    },
    footer: {
      copy: `© ${new Date().getFullYear()} galleybook`,
      links: [
        { label: "Confidentialité", href: "/privacy" },
        { label: "Conditions", href: "/terms" },
        { label: "Impressum", href: "/impressum" },
      ],
    },
  },
  es: {
    nav: { signIn: "Iniciar sesión" },
    hero: {
      tag: "Guardado de recetas con IA",
      headline1: "Guarda recetas de",
      headline2: "todas partes.",
      headline3: "Llévelas contigo",
      headline4: "a donde vayas.",
      sub: "galleybook importa cualquier receta de Instagram, YouTube, TikTok o cualquier sitio web en segundos — y mantiene toda tu colección hermosamente organizada, siempre contigo.",
      inputPlaceholder: "tu@email.es",
      cta: "Unirse a la lista de espera",
      ctaPending: "Uniéndose…",
      ctaDone: "Estás en la lista ✓",
      ctaError: "Algo salió mal — por favor intenta de nuevo.",
      ctaNote: "Gratis. Sin spam.",
    },
    features: {
      label: "Qué obtienes",
      heading: "Cada receta,\ncada fuente, un lugar.",
      items: [
        { icon: "link", title: "Guarda desde cualquier lugar", body: "Pega cualquier URL — Instagram, YouTube, TikTok o sitio de recetas. Nuestra IA analiza la receta completa en segundos." },
        { icon: "phone", title: "Siempre contigo", body: "Tus recetas viven en tu bolsillo. Explora, busca y cocina desde tu teléfono — incluso sin conexión." },
        { icon: "users", title: "Cocina juntos", body: "Comparte una Galley con tu familia o amigos. Una biblioteca, las contribuciones de todos — perfectamente organizada." },
        { icon: "sparkles", title: "Descubrimiento con IA", body: "Recibe sugerencias de recetas personalizadas de las fuentes que amas. Añade directamente a tu Galley." },
      ],
    },
    how: {
      label: "Cómo funciona",
      heading: "Tres pasos hacia tu\ncolección de recetas perfecta.",
      steps: [
        { num: "01", title: "Comparte un enlace", body: "Copia cualquier URL de receta — de Instagram, YouTube, TikTok o tu blog de comida favorito. Pégala en galleybook." },
        { num: "02", title: "La IA hace el resto", body: "Nuestra IA extrae cada detalle: ingredientes con cantidades, instrucciones paso a paso, tiempo de cocción y fotos." },
        { num: "03", title: "Cocina y comparte", body: "Tu receta está guardada y lista. Cocina con ella, compártela con tu Galley y construye tu colección personal." },
      ],
    },
    sources: { label: "Compatible con" },
    cta2: {
      heading: "Tus recetas merecen\nun mejor hogar.",
      sub: "Únete a la lista de espera y sé el primero en saber cuando galleybook abra.",
      inputPlaceholder: "tu@email.es",
      cta: "Acceso anticipado",
      ctaPending: "Uniéndose…",
      ctaDone: "Estás en la lista ✓",
      ctaNote: "Gratis. No se requiere tarjeta de crédito.",
    },
    footer: {
      copy: `© ${new Date().getFullYear()} galleybook`,
      links: [
        { label: "Privacidad", href: "/privacy" },
        { label: "Términos", href: "/terms" },
        { label: "Impressum", href: "/impressum" },
      ],
    },
  },
  it: {
    nav: { signIn: "Accedi" },
    hero: {
      tag: "Salvataggio ricette con IA",
      headline1: "Salva ricette da",
      headline2: "ovunque.",
      headline3: "Portale con te",
      headline4: "ovunque tu vada.",
      sub: "galleybook importa qualsiasi ricetta da Instagram, YouTube, TikTok o qualsiasi sito web in pochi secondi — e mantiene tutta la tua collezione magnificamente organizzata, sempre con te.",
      inputPlaceholder: "tua@email.it",
      cta: "Unisciti alla lista d'attesa",
      ctaPending: "Iscrizione…",
      ctaDone: "Sei nella lista ✓",
      ctaError: "Qualcosa è andato storto — riprova.",
      ctaNote: "Gratis. Niente spam.",
    },
    features: {
      label: "Cosa ottieni",
      heading: "Ogni ricetta,\nogni fonte, un posto.",
      items: [
        { icon: "link", title: "Salva da ovunque", body: "Incolla qualsiasi URL — Instagram, YouTube, TikTok o sito di ricette. La nostra IA analizza la ricetta completa in pochi secondi." },
        { icon: "phone", title: "Sempre con te", body: "Le tue ricette vivono in tasca. Sfoglia, cerca e cucina dal telefono — anche offline." },
        { icon: "users", title: "Cucina insieme", body: "Condividi una Galley con la famiglia o gli amici. Una libreria, i contributi di tutti — perfettamente organizzata." },
        { icon: "sparkles", title: "Scoperta con IA", body: "Ricevi suggerimenti di ricette personalizzati dalle fonti che ami. Aggiungi direttamente alla tua Galley." },
      ],
    },
    how: {
      label: "Come funziona",
      heading: "Tre passi verso la tua\ncollection di ricette perfetta.",
      steps: [
        { num: "01", title: "Condividi un link", body: "Copia qualsiasi URL di ricetta — da Instagram, YouTube, TikTok o il tuo blog culinario preferito. Incollalo in galleybook." },
        { num: "02", title: "L'IA fa il resto", body: "La nostra IA estrae ogni dettaglio: ingredienti con quantità, istruzioni passo-passo, tempo di cottura e foto." },
        { num: "03", title: "Cucina e condividi", body: "La tua ricetta è salvata e pronta. Cucinaci, condividila con la tua Galley e costruisci la tua collezione personale." },
      ],
    },
    sources: { label: "Compatibile con" },
    cta2: {
      heading: "Le tue ricette meritano\nuna casa migliore.",
      sub: "Unisciti alla lista d'attesa e sii tra i primi a sapere quando galleybook apre.",
      inputPlaceholder: "tua@email.it",
      cta: "Accesso anticipato",
      ctaPending: "Iscrizione…",
      ctaDone: "Sei nella lista ✓",
      ctaNote: "Gratis. Nessuna carta di credito richiesta.",
    },
    footer: {
      copy: `© ${new Date().getFullYear()} galleybook`,
      links: [
        { label: "Privacy", href: "/privacy" },
        { label: "Termini", href: "/terms" },
        { label: "Impressum", href: "/impressum" },
      ],
    },
  },
  pl: {
    nav: { signIn: "Zaloguj się" },
    hero: {
      tag: "Zapisywanie przepisów z AI",
      headline1: "Zapisuj przepisy",
      headline2: "skąd chcesz.",
      headline3: "Miej je zawsze",
      headline4: "przy sobie.",
      sub: "galleybook importuje każdy przepis z Instagrama, YouTube, TikToka lub dowolnej strony w ciągu sekund — i przechowuje całą kolekcję pięknie zorganizowaną, zawsze z tobą.",
      inputPlaceholder: "twoj@email.pl",
      cta: "Dołącz do listy oczekujących",
      ctaPending: "Dołączanie…",
      ctaDone: "Jesteś na liście ✓",
      ctaError: "Coś poszło nie tak — spróbuj ponownie.",
      ctaNote: "Bezpłatnie. Bez spamu.",
    },
    features: {
      label: "Co otrzymujesz",
      heading: "Każdy przepis,\nkażde źródło, jedno miejsce.",
      items: [
        { icon: "link", title: "Zapisuj skąd chcesz", body: "Wklej dowolny URL — Instagram, YouTube, TikTok lub strona z przepisami. Nasza AI analizuje pełny przepis w kilka sekund." },
        { icon: "phone", title: "Zawsze z tobą", body: "Twoje przepisy są zawsze w kieszeni. Przeglądaj, szukaj i gotuj ze swojego telefonu — nawet offline." },
        { icon: "users", title: "Gotuj razem", body: "Udostępnij Galley rodzinie lub przyjaciołom. Jedna biblioteka, wkład wszystkich — idealnie zorganizowana." },
        { icon: "sparkles", title: "Odkrywanie z AI", body: "Otrzymuj spersonalizowane sugestie przepisów z ulubionych źródeł. Dodaj bezpośrednio do swojej Galley." },
      ],
    },
    how: {
      label: "Jak to działa",
      heading: "Trzy kroki do idealnej\nkolekcji przepisów.",
      steps: [
        { num: "01", title: "Udostępnij link", body: "Skopiuj dowolny URL przepisu — z Instagrama, YouTube, TikToka lub ulubionego bloga kulinarnego. Wklej go do galleybook." },
        { num: "02", title: "AI robi resztę", body: "Nasza AI wyodrębnia każdy szczegół: składniki z ilościami, instrukcje krok po kroku, czas gotowania i zdjęcia." },
        { num: "03", title: "Gotuj i udostępniaj", body: "Twój przepis jest zapisany i gotowy. Gotuj według niego, udostępnij go w swojej Galley i buduj osobistą kolekcję." },
      ],
    },
    sources: { label: "Działa z" },
    cta2: {
      heading: "Twoje przepisy zasługują\nna lepszy dom.",
      sub: "Dołącz do listy oczekujących i jako pierwszy dowiedz się, gdy galleybook otworzy się.",
      inputPlaceholder: "twoj@email.pl",
      cta: "Wczesny dostęp",
      ctaPending: "Dołączanie…",
      ctaDone: "Jesteś na liście ✓",
      ctaNote: "Bezpłatnie. Karta kredytowa nie jest wymagana.",
    },
    footer: {
      copy: `© ${new Date().getFullYear()} galleybook`,
      links: [
        { label: "Prywatność", href: "/privacy" },
        { label: "Warunki", href: "/terms" },
        { label: "Impressum", href: "/impressum" },
      ],
    },
  },
};

type Lang = "en" | "de" | "fr" | "es" | "it" | "pl";

function IconLink() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function IconPhone() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <path d="M12 18h.01" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconInstagram() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconYouTube() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z" />
      <polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconTikTok() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z" />
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function IconSparkles() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}

const iconMap: Record<string, () => ReactElement> = {
  link: IconLink,
  phone: IconPhone,
  users: IconUsers,
  sparkles: IconSparkles,
};

function WaitlistForm({
  placeholder,
  ctaLabel,
  ctaPending,
  ctaDone,
  errorMsg,
  note,
  dark = false,
}: {
  placeholder: string;
  ctaLabel: string;
  ctaPending: string;
  ctaDone: string;
  errorMsg: string;
  note: string;
  dark?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "pending" | "done" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status !== "idle") return;
    setStatus("pending");
    const res = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) {
      setStatus("done");
      if (hasConsent()) (window as any).fbq?.("track", "Lead");
    } else {
      setStatus("error");
    }
  }

  const inputBg = dark ? "bg-white/10 placeholder:text-white/40 text-white border border-white/20 focus:border-white/60" : "bg-[#F3F3F4] text-anthracite placeholder:text-anthracite/40";

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={placeholder}
          disabled={status !== "idle"}
          className={`flex-1 px-5 py-3.5 rounded-full text-sm font-light outline-none disabled:opacity-40 transition-colors ${inputBg}`}
        />
        <button
          type="submit"
          disabled={status !== "idle"}
          className="px-6 py-3.5 rounded-full text-sm font-light border transition-all disabled:opacity-40 whitespace-nowrap"
          style={
            dark
              ? {
                  backgroundColor: status === "done" ? "transparent" : "#fff",
                  color: status === "done" ? "#fff" : "#252729",
                  borderColor: "#fff",
                }
              : {
                  backgroundColor: status === "done" ? "#fff" : "#252729",
                  color: status === "done" ? "#252729" : "#fff",
                  borderColor: "#252729",
                }
          }
        >
          {status === "pending" ? ctaPending : status === "done" ? ctaDone : ctaLabel}
        </button>
      </form>
      {status === "error" && (
        <p className={`mt-2 text-xs font-light ${dark ? "text-white/60" : "text-anthracite/60"}`}>{errorMsg}</p>
      )}
      <p className={`mt-3 text-xs font-light ${dark ? "text-white/40" : "text-anthracite/40"}`}>{note}</p>
    </div>
  );
}

export default function LandingPage() {
  const [lang, setLang] = useState<Lang>("en");
  const t = copy[lang];

  return (
    <div className="min-h-screen flex flex-col bg-white font-sans overflow-x-hidden relative">
      <ConsentBanner />

      {/* ── Botanical backdrop ── */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: "url('/landing-bg.webp')",
          backgroundSize: "cover",
          backgroundPosition: "center top",
          backgroundRepeat: "no-repeat",
          opacity: 0.18,
        }}
      />

      {/* ── Nav ── */}
      <header className="flex items-center justify-between px-6 py-5 md:px-16 sticky top-0 bg-transparent z-50">
        <a href="/" className="select-none flex-shrink-0">
          <Image src="/logo.png" alt="galleybook" width={40} height={32} className="object-contain" />
        </a>
        <div className="flex items-center gap-3">
          <a
            href="https://app.galleybook.com/auth/login"
            className="px-4 py-2 rounded-full text-sm font-light border transition-opacity hover:opacity-70 border-anthracite text-anthracite whitespace-nowrap"
          >
            {t.nav.signIn}
          </a>
          <div className="flex items-center gap-1 border border-anthracite rounded-full px-1 py-1">
            {(["en", "de", "fr", "es", "it", "pl"] as Lang[]).map((l) => (
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
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative px-6 md:px-16 pt-16 pb-24 md:pt-24 md:pb-32 overflow-hidden">
        {/* Decorative background blobs */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full opacity-[0.06]"
          style={{ background: "radial-gradient(circle, #252729 0%, transparent 70%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-24 w-[400px] h-[400px] rounded-full opacity-[0.04]"
          style={{ background: "radial-gradient(circle, #252729 0%, transparent 70%)" }}
        />

        <div className="relative max-w-5xl mx-auto">
          {/* Tag */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-anthracite/20 bg-surface-low mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-anthracite/60" />
            <span className="text-xs font-semibold uppercase tracking-widest text-anthracite/60">
              {t.hero.tag}
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-thin text-anthracite leading-[1.05] mb-8">
            <span className="block">{t.hero.headline1}</span>
            <span className="block italic">{t.hero.headline2}</span>
            <span className="block mt-2 md:mt-4">{t.hero.headline3}</span>
            <span className="block italic">{t.hero.headline4}</span>
          </h1>

          {/* Sub */}
          <p className="text-base md:text-lg font-light text-on-surface-variant max-w-xl mb-10 leading-relaxed">
            {t.hero.sub}
          </p>

          {/* CTA */}
          <WaitlistForm
            placeholder={t.hero.inputPlaceholder}
            ctaLabel={t.hero.cta}
            ctaPending={t.hero.ctaPending}
            ctaDone={t.hero.ctaDone}
            errorMsg={t.hero.ctaError}
            note={t.hero.ctaNote}
          />
        </div>

        {/* Decorative source-pill row */}
        <div className="relative max-w-5xl mx-auto mt-20 md:mt-28">
          <p className="text-xs font-semibold uppercase tracking-widest text-anthracite/40 mb-4">
            {t.sources.label}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {[
              { label: "Instagram", Icon: IconInstagram },
              { label: "YouTube",   Icon: IconYouTube   },
              { label: "TikTok",    Icon: IconTikTok    },
            ].map(({ label, Icon }) => (
              <span
                key={label}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-light text-anthracite border border-anthracite/20"
              >
                <Icon />
                {label}
              </span>
            ))}
            {/* Separator dot */}
            <span className="w-1 h-1 rounded-full bg-anthracite/20 mx-1" />
            {/* Any website — single globe icon */}
            <span className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-light text-anthracite border border-anthracite/20">
              <IconGlobe />
              Any website
            </span>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="px-6 md:px-16 py-24 md:py-32 bg-[#F9F9F9]">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-anthracite/40 mb-4">
            {t.features.label}
          </p>
          <h2 className="text-4xl md:text-5xl font-thin text-anthracite leading-tight mb-16 whitespace-pre-line">
            {t.features.heading}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {t.features.items.map((f) => {
              const Icon = iconMap[f.icon];
              return (
                <div
                  key={f.title}
                  className="bg-white rounded-md p-8 shadow-ambient flex flex-col gap-4"
                >
                  <div className="w-10 h-10 rounded-full bg-surface-low flex items-center justify-center text-anthracite">
                    <Icon />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-anthracite mb-2">{f.title}</p>
                    <p className="text-sm font-light text-on-surface-variant leading-relaxed">{f.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="px-6 md:px-16 py-24 md:py-32">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-anthracite/40 mb-4">
            {t.how.label}
          </p>
          <h2 className="text-4xl md:text-5xl font-thin text-anthracite leading-tight mb-16 whitespace-pre-line">
            {t.how.heading}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {t.how.steps.map((step, i) => (
              <div key={step.num} className="relative">
                {/* Connector line (desktop) */}
                {i < t.how.steps.length - 1 && (
                  <div
                    aria-hidden
                    className="hidden md:block absolute top-5 left-[calc(100%+16px)] right-0 h-px bg-anthracite/10"
                    style={{ width: "calc(100% - 32px)" }}
                  />
                )}
                <span className="text-xs font-semibold tracking-widest text-anthracite/30 mb-4 block">
                  {step.num}
                </span>
                <p className="text-lg font-light text-anthracite mb-2">{step.title}</p>
                <p className="text-sm font-light text-on-surface-variant leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Second CTA ── */}
      <section className="mx-4 md:mx-16 mb-16 rounded-md overflow-hidden">
        <div
          className="px-8 md:px-16 py-16 md:py-20 relative"
          style={{ backgroundColor: "#252729" }}
        >
          {/* Decorative blob */}
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 right-0 w-96 h-96 opacity-10"
            style={{ background: "radial-gradient(circle at 80% 20%, #fff 0%, transparent 60%)" }}
          />

          <div className="relative max-w-2xl">
            <h2 className="text-4xl md:text-5xl font-thin text-white leading-tight mb-4 whitespace-pre-line">
              {t.cta2.heading}
            </h2>
            <p className="text-base font-light text-white/60 mb-8 leading-relaxed">
              {t.cta2.sub}
            </p>
            <WaitlistForm
              placeholder={t.cta2.inputPlaceholder}
              ctaLabel={t.cta2.cta}
              ctaPending={t.cta2.ctaPending}
              ctaDone={t.cta2.ctaDone}
              errorMsg=""
              note={t.cta2.ctaNote}
              dark
            />
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="px-6 md:px-16 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="text-xs font-light text-anthracite/40">{t.footer.copy}</span>
        <div className="flex gap-6">
          {t.footer.links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-xs font-light text-anthracite/40 hover:text-anthracite transition-colors"
            >
              {l.label}
            </a>
          ))}
        </div>
      </footer>

    </div>
  );
}
