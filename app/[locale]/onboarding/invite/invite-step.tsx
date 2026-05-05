"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function InviteStep({
  galleyId,
  labels,
}: {
  galleyId: string;
  labels: {
    generating: string;
    copy: string;
    copied: string;
    skip: string;
    done: string;
    error: string;
  };
}) {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/invites/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ galleyId }),
      });
      if (cancelled) return;
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const j = (await res.json()) as { url: string };
      setUrl(j.url);
    })();
    return () => {
      cancelled = true;
    };
  }, [galleyId]);

  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function next() {
    router.push("/onboarding/intro");
  }

  return (
    <div className="space-y-6">
      <div className="bg-[#E2E2E2] rounded-md px-4 py-3 flex items-center gap-3">
        <span className="flex-1 text-xs font-light text-anthracite truncate">
          {failed ? labels.error : url ?? labels.generating}
        </span>
        <button
          type="button"
          onClick={copy}
          disabled={!url}
          style={{ backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }}
          className="border text-xs font-light px-3 py-1 rounded-full disabled:opacity-40"
        >
          {copied ? labels.copied : labels.copy}
        </button>
      </div>
      <div className="space-y-3">
        <button
          type="button"
          onClick={next}
          style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
          className="w-full border text-sm font-light py-4 rounded-full"
        >
          {labels.done}
        </button>
        <button
          type="button"
          onClick={next}
          className="w-full text-sm font-light py-3 text-on-surface-variant"
        >
          {labels.skip}
        </button>
      </div>
    </div>
  );
}
