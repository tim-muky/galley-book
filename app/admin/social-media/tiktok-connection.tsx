"use client";

import { useState } from "react";

export type TikTokConnectionState = {
  connected: boolean;
  displayName: string | null;
  connectedAt: string | null;
  scope: string | null;
};

const STATUS_MESSAGES: Record<string, string> = {
  connected: "✓ TikTok connected.",
  denied: "Authorization was cancelled.",
  badstate: "Session expired — start the connection again.",
  exchangefailed: "Couldn't complete the connection — try again.",
  misconfigured: "TikTok app keys are not configured.",
  storefailed: "Authorized, but saving the connection failed — try again.",
};

export function TikTokConnection({
  connection,
  status,
}: {
  connection: TikTokConnectionState;
  status: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function disconnect() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/social-media/tiktok/disconnect", { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to disconnect");
      setBusy(false);
      return;
    }
    window.location.href = "/admin/social-media";
  }

  function connect() {
    // Full-page navigation: the route 302-redirects to TikTok's OAuth consent.
    window.location.href = "/api/admin/social-media/tiktok/connect";
  }

  const statusMessage = status ? STATUS_MESSAGES[status] : null;

  return (
    <div className="bg-surface-low rounded-md p-4 mb-8">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
        TikTok connection
      </p>

      {statusMessage && (
        <p
          className={`text-xs font-light mb-3 ${
            status === "connected" ? "text-anthracite" : "text-red-600"
          }`}
        >
          {statusMessage}
        </p>
      )}

      {connection.connected ? (
        <>
          <p className="text-sm font-light text-anthracite mb-1">
            Connected{connection.displayName ? ` as ${connection.displayName}` : ""}
          </p>
          {connection.connectedAt && (
            <p className="text-xs font-light text-on-surface-variant mb-3">
              since {new Date(connection.connectedAt).toLocaleDateString()}
              {connection.scope ? ` · ${connection.scope}` : ""}
            </p>
          )}
          {error && <p className="text-xs font-light text-red-600 mb-3">{error}</p>}
          <div className="flex gap-2 items-center flex-wrap">
            <button
              type="button"
              onClick={connect}
              className="border border-anthracite bg-white text-anthracite text-xs font-light py-2 px-4 rounded-full"
            >
              Reconnect ↗
            </button>
            <button
              type="button"
              onClick={disconnect}
              disabled={busy}
              className="border border-red-300 bg-white text-red-600 text-xs font-light py-2 px-4 rounded-full disabled:opacity-40"
            >
              {busy ? "…" : "Disconnect"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs font-light text-on-surface-variant mb-3">
            Authorize galleybook&apos;s own TikTok account to enable Campaign Studio publishing.
          </p>
          {error && <p className="text-xs font-light text-red-600 mb-3">{error}</p>}
          <button
            type="button"
            onClick={connect}
            className="border border-anthracite bg-anthracite text-white text-xs font-light py-2 px-4 rounded-full"
          >
            Connect TikTok ↗
          </button>
        </>
      )}
    </div>
  );
}
