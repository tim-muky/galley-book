"use client";

const BRING_API = "https://api.getbring.com/rest/bringrecipes/deeplink";

interface BringButtonProps {
  shareToken: string;
  servings?: number;
}

export function BringButton({ shareToken, servings = 4 }: BringButtonProps) {
  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://galleybook.com"}/share/${shareToken}`;
  const bringUrl = `${BRING_API}?url=${encodeURIComponent(shareUrl)}&source=web&baseQuantity=${servings}&requestedQuantity=${servings}`;

  return (
    <a
      href={bringUrl}
      style={{ backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }}
      className="w-full border flex items-center justify-center gap-2.5 font-light text-sm rounded-full py-3 px-6 transition-opacity hover:opacity-80 active:opacity-70"
    >
      {/* Bring! shopping bag icon */}
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M3 5h12l-1.5 9H4.5L3 5z" stroke="#252729" strokeWidth="1.3" strokeLinejoin="round"/>
        <path d="M6.5 5V3.5A2.5 2.5 0 0111.5 3.5V5" stroke="#252729" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
      Add to Shopping List
    </a>
  );
}
