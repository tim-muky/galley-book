"use client";

import { useState } from "react";

export function ShareButton({
  shareToken,
  recipeName,
}: {
  shareToken: string;
  recipeName: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = `${window.location.origin}/share/${shareToken}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: recipeName, url });
      } catch {
        // User cancelled — no-op
      }
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button
      onClick={handleShare}
      className="w-11 h-11 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-full shadow-ambient"
      aria-label="Share recipe"
    >
      {copied ? (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <path d="M2.5 7.5l3.5 3.5 7-7" stroke="#252729" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <circle cx="11.5" cy="2.5" r="1.8" stroke="#252729" strokeWidth="1.3"/>
          <circle cx="11.5" cy="12.5" r="1.8" stroke="#252729" strokeWidth="1.3"/>
          <circle cx="3.5" cy="7.5" r="1.8" stroke="#252729" strokeWidth="1.3"/>
          <path d="M5.2 6.6l4.6-2.8M5.2 8.4l4.6 2.8" stroke="#252729" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      )}
    </button>
  );
}
