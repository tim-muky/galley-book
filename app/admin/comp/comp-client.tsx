"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type CompRow = {
  id: string;
  galley_id: string;
  status: "active" | "expired" | "in_billing_retry" | "cancelled" | "revoked";
  starts_at: string;
  expires_at: string | null;
  grant_reason: string | null;
  revoked_at: string | null;
  created_at: string;
  galleys: { name: string } | null;
  granter: { name: string | null; email: string } | null;
};

type GalleyRow = { id: string; name: string; owner_email: string | null };

const PRESETS = [
  { label: "1 month", days: 30 },
  { label: "3 months", days: 90 },
  { label: "1 year", days: 365 },
  { label: "Forever", days: null },
];

export function CompClient({
  galleys,
  active,
  past,
}: {
  galleys: GalleyRow[];
  active: CompRow[];
  past: CompRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [galleyId, setGalleyId] = useState("");
  const [presetDays, setPresetDays] = useState<number | null>(30);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const filteredGalleys = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return galleys.slice(0, 20);
    return galleys
      .filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          (g.owner_email?.toLowerCase().includes(q) ?? false)
      )
      .slice(0, 20);
  }, [galleys, search]);

  const selectedGalley = galleys.find((g) => g.id === galleyId) ?? null;

  async function grant() {
    setError(null);
    if (!galleyId) {
      setError("Pick a galley first.");
      return;
    }
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }

    const expiresAt =
      presetDays === null
        ? null
        : new Date(Date.now() + presetDays * 86_400_000).toISOString();

    const res = await fetch("/api/admin/comp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ galley_id: galleyId, expires_at: expiresAt, reason: reason.trim() }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Failed to grant comp.");
      return;
    }

    setSearch("");
    setGalleyId("");
    setReason("");
    setPresetDays(30);
    startTransition(() => router.refresh());
  }

  async function revoke(id: string, galleyName: string) {
    if (!confirm(`Revoke comp for "${galleyName}"? They'll fall back to free immediately.`)) return;
    const res = await fetch(`/api/admin/comp/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      alert(body.error ?? "Failed to revoke.");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Grant form */}
      <div className="bg-white rounded-md p-5 shadow-ambient">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-4">
          Grant comp entitlement
        </p>

        <label className="block text-xs font-light text-on-surface-variant mb-1.5">
          Galley
        </label>
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setGalleyId("");
          }}
          placeholder="Search by galley name or owner email"
          className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none mb-2"
        />

        {(search || !galleyId) && (
          <div className="bg-surface-low rounded-md mb-3 max-h-48 overflow-y-auto">
            {filteredGalleys.length === 0 ? (
              <p className="px-4 py-3 text-xs font-light text-on-surface-variant">No matches.</p>
            ) : (
              filteredGalleys.map((g) => (
                <button
                  key={g.id}
                  onClick={() => {
                    setGalleyId(g.id);
                    setSearch(g.name);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm font-light hover:bg-surface-lowest ${
                    galleyId === g.id ? "bg-surface-lowest text-anthracite" : "text-anthracite"
                  }`}
                >
                  <span>{g.name}</span>
                  {g.owner_email && (
                    <span className="text-on-surface-variant text-xs"> · {g.owner_email}</span>
                  )}
                </button>
              ))
            )}
          </div>
        )}

        {selectedGalley && (
          <p className="text-xs font-light text-anthracite mb-4">
            Selected: <span className="font-normal">{selectedGalley.name}</span>
            {selectedGalley.owner_email && (
              <span className="text-on-surface-variant"> · {selectedGalley.owner_email}</span>
            )}
          </p>
        )}

        <label className="block text-xs font-light text-on-surface-variant mb-1.5">
          Duration
        </label>
        <div className="flex gap-2 flex-wrap mb-4">
          {PRESETS.map((p) => {
            const isActive = presetDays === p.days;
            return (
              <button
                key={p.label}
                onClick={() => setPresetDays(p.days)}
                className="border text-sm font-light px-4 py-2 rounded-full"
                style={
                  isActive
                    ? { backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }
                    : { backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }
                }
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <label className="block text-xs font-light text-on-surface-variant mb-1.5">
          Reason
        </label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. early access, press, partner"
          className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none mb-4"
        />

        {error && (
          <p className="text-xs font-light text-red-500 mb-3">{error}</p>
        )}

        <button
          onClick={grant}
          disabled={pending || !galleyId || !reason.trim()}
          className="border text-sm font-light py-3 px-6 rounded-full disabled:opacity-40"
          style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
        >
          {pending ? "Granting…" : "Grant comp"}
        </button>
      </div>

      {/* Active comps */}
      <div className="bg-white rounded-md shadow-ambient overflow-hidden">
        <div className="px-5 pt-4 pb-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
            Active comps · {active.length}
          </p>
        </div>
        {active.length === 0 ? (
          <p className="px-5 pb-5 text-xs font-light text-on-surface-variant">
            No active comps.
          </p>
        ) : (
          <ul>
            {active.map((c) => (
              <li
                key={c.id}
                className="flex items-start gap-3 px-5 py-3 border-t border-surface-low"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-normal text-anthracite">
                    {c.galleys?.name ?? "—"}
                  </p>
                  <p className="text-[11px] font-light text-on-surface-variant">
                    {c.grant_reason}
                    {" · "}
                    {c.expires_at
                      ? `expires ${fmtDate(c.expires_at)}`
                      : "no expiry"}
                    {c.granter && ` · granted by ${c.granter.name ?? c.granter.email}`}
                  </p>
                </div>
                <button
                  onClick={() => revoke(c.id, c.galleys?.name ?? "this galley")}
                  className="border text-xs font-light px-3 py-1.5 rounded-full text-red-500 border-red-500"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Audit log */}
      <div className="bg-white rounded-md shadow-ambient overflow-hidden">
        <div className="px-5 pt-4 pb-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
            Past comps · {past.length}
          </p>
        </div>
        {past.length === 0 ? (
          <p className="px-5 pb-5 text-xs font-light text-on-surface-variant">No history yet.</p>
        ) : (
          <ul>
            {past.map((c) => (
              <li
                key={c.id}
                className="flex items-start gap-3 px-5 py-3 border-t border-surface-low"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-light text-anthracite">
                    {c.galleys?.name ?? "—"}{" "}
                    <span className="text-on-surface-variant text-xs">· {c.status}</span>
                  </p>
                  <p className="text-[11px] font-light text-on-surface-variant">
                    {c.grant_reason}
                    {c.revoked_at
                      ? ` · revoked ${fmtDate(c.revoked_at)}`
                      : c.expires_at
                      ? ` · expired ${fmtDate(c.expires_at)}`
                      : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
