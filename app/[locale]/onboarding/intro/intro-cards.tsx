"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Labels = {
  cards: { title: string; body: string }[];
  skip: string;
  next: string;
  done: string;
};

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

  return (
    <div className="space-y-8">
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
  );
}
