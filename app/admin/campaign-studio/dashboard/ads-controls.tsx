"use client";

import { useState } from "react";

export function AdsControls() {
  const [weekly, setWeekly] = useState("35");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "budget" | "pause" | "resume") {
    setBusy(action);
    setMsg(null);
    setError(null);
    const body =
      action === "budget"
        ? { action, weeklyEuros: Number(weekly) }
        : { action };
    const res = await fetch("/api/admin/campaign-studio/ads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error ?? "Action failed");
    else
      setMsg(
        action === "budget"
          ? `Weekly budget set to €${weekly} (€${(Number(weekly) / 7).toFixed(2)}/day)`
          : action === "pause"
            ? "Campaign paused"
            : "Campaign resumed",
      );
    setBusy(null);
  }

  return (
    <div className="bg-white rounded-md p-4 shadow-ambient">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-3">
        Campaign control
      </p>

      <div className="flex items-end gap-2 mb-3">
        <div className="flex-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
            Weekly budget (€)
          </label>
          <input
            type="number"
            value={weekly}
            onChange={(e) => setWeekly(e.target.value)}
            min={7}
            className="w-full bg-white border border-[#252729] rounded-full px-4 py-2 text-sm font-light text-anthracite outline-none mt-1"
          />
        </div>
        <button
          type="button"
          onClick={() => run("budget")}
          disabled={busy !== null || !weekly}
          className="border border-anthracite bg-anthracite text-white text-sm font-light py-2 px-5 rounded-full disabled:opacity-40"
        >
          {busy === "budget" ? "Saving…" : "Set"}
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => run("pause")}
          disabled={busy !== null}
          className="flex-1 border border-anthracite bg-white text-anthracite text-sm font-light py-2 rounded-full disabled:opacity-40"
        >
          {busy === "pause" ? "Pausing…" : "Pause"}
        </button>
        <button
          type="button"
          onClick={() => run("resume")}
          disabled={busy !== null}
          className="flex-1 border border-anthracite bg-anthracite text-white text-sm font-light py-2 rounded-full disabled:opacity-40"
        >
          {busy === "resume" ? "Resuming…" : "Launch / Resume"}
        </button>
      </div>

      {msg && <p className="text-xs font-light text-anthracite mt-3">{msg}</p>}
      {error && <p className="text-xs font-light text-red-600 mt-3">{error}</p>}
      <p className="text-[10px] font-light text-on-surface-variant mt-3">
        Weekly budget is pushed to Meta as a daily budget (weekly ÷ 7).
      </p>
    </div>
  );
}
