"use client";

import Link from "next/link";

const APP_STORE_URL = "https://apps.apple.com/app/id6764606059";

type Labels = {
  title: string;
  tagline: string;
  features: string[];
  trialHeadline: string;
  trialSub: string;
  startTrial: string;
  legal: string;
  terms: string;
  privacy: string;
};

export function PaywallContent({ labels }: { labels: Labels }) {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-md px-6 py-12 flex flex-col gap-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-thin text-anthracite leading-tight">
            {labels.title}
          </h1>
          <p className="text-sm font-light text-on-surface-variant">
            {labels.tagline}
          </p>
        </div>

        <ul className="space-y-3">
          {labels.features.map((line) => (
            <li key={line} className="flex items-center gap-3 text-sm font-light text-anthracite">
              <CheckIcon />
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <div
          className="rounded-xl px-5 py-6 flex flex-col items-center gap-2 text-center"
          style={{ backgroundColor: "#A4ED5A" }}
        >
          <h2 className="text-2xl font-thin text-anthracite leading-tight">
            {labels.trialHeadline}
          </h2>
          <p className="text-sm font-light text-on-surface-variant">
            {labels.trialSub}
          </p>
        </div>

        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
          className="border text-sm font-light py-4 rounded-full text-center"
        >
          {labels.startTrial}
        </a>

        <p className="text-xs font-light text-on-surface-variant leading-relaxed">
          {labels.legal}
        </p>

        <div className="flex items-center justify-center gap-6 text-xs font-light text-on-surface-variant">
          <Link href="/terms" className="underline">
            {labels.terms}
          </Link>
          <span>·</span>
          <Link href="/privacy" className="underline">
            {labels.privacy}
          </Link>
        </div>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
