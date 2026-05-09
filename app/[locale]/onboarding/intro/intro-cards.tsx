"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Labels = {
  cards: { title: string; body: string }[];
  skip: string;
  next: string;
  done: string;
};

// Each slide gets two decorative illustrations bleeding off opposite corners.
// Mirrors the native IntroScreen so the cross-platform onboarding feels the
// same. Sources are public assets so Next/Image handles them without a config
// roundtrip.
type Slot = {
  src: string;
  alt: string;
  // CSS positioning — fractions of the card so the layout adapts on small phones.
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
  // Tailwind w-* class — pinned to the card width.
  size: string;
};

const SLIDES: Slot[][] = [
  [
    { src: "/onboarding/kale.png",    alt: "", top: "-1rem",    right: "-2rem", size: "w-44 h-44" },
    { src: "/onboarding/carrots.png", alt: "", bottom: "-2rem", left: "-2rem",  size: "w-44 h-44" },
  ],
  [
    { src: "/onboarding/watercress.png", alt: "", top: "-1rem",    left: "-2rem",  size: "w-40 h-40" },
    { src: "/onboarding/turnip.png",     alt: "", bottom: "-1rem", right: "-2rem", size: "w-40 h-40" },
  ],
  [
    { src: "/onboarding/beets.png",       alt: "", top: "-1rem",    right: "-1.5rem", size: "w-44 h-44" },
    { src: "/onboarding/cauliflower.png", alt: "", bottom: "-2rem", left: "-2rem",    size: "w-44 h-44" },
  ],
];

export function IntroCards({ labels }: { labels: Labels }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const last = index === labels.cards.length - 1;

  function advance() {
    if (last) {
      router.push("/onboarding/add-recipe");
    } else {
      setIndex(index + 1);
    }
  }

  function skip() {
    router.push("/onboarding/add-recipe");
  }

  const card = labels.cards[index];
  const slots = SLIDES[index] ?? [];

  return (
    <div className="relative w-full">
      {slots.map((slot, i) => (
        <div
          key={`${index}-${i}`}
          className={`pointer-events-none absolute ${slot.size}`}
          style={{
            top: slot.top,
            bottom: slot.bottom,
            left: slot.left,
            right: slot.right,
          }}
        >
          <Image
            src={slot.src}
            alt={slot.alt}
            fill
            sizes="200px"
            style={{ objectFit: "contain" }}
            priority={index === 0}
          />
        </div>
      ))}

      <div className="relative space-y-8 py-16">
        <div className="space-y-3 min-h-[180px]">
          <h1 className="text-4xl font-thin text-anthracite leading-tight">
            {card.title}
          </h1>
          <p className="text-sm font-light text-on-surface-variant">{card.body}</p>
        </div>

        <div className="flex items-center justify-center gap-2">
          {labels.cards.map((_, i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full transition-colors"
              style={{ backgroundColor: i === index ? "#252729" : "#D9D9D9" }}
            />
          ))}
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={advance}
            style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
            className="w-full border text-sm font-light py-4 rounded-full"
          >
            {last ? labels.done : labels.next}
          </button>
          {!last && (
            <button
              type="button"
              onClick={skip}
              className="w-full text-sm font-light py-3 text-on-surface-variant"
            >
              {labels.skip}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
