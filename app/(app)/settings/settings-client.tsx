"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { UserProfile, SavedSource } from "@/types/database";

interface Membership {
  galley_id: string;
  role: string;
  galleys: { id: string; name: string } | null;
}

interface Member {
  galley_id: string;
  user_id: string;
  role: string;
  users: { name: string | null; email: string; avatar_url: string | null } | null;
}

interface DeletedRecipe {
  id: string;
  name: string;
  deleted_at: string;
}

const LANGUAGES = [
  { code: "de", name: "German" },
  { code: "fr", name: "French" },
  { code: "es", name: "Spanish" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "nl", name: "Dutch" },
  { code: "sv", name: "Swedish" },
  { code: "da", name: "Danish" },
  { code: "no", name: "Norwegian" },
  { code: "ja", name: "Japanese" },
  { code: "zh", name: "Chinese (Simplified)" },
  { code: "ko", name: "Korean" },
  { code: "ru", name: "Russian" },
  { code: "ar", name: "Arabic" },
  { code: "tr", name: "Turkish" },
  { code: "pl", name: "Polish" },
];

interface Props {
  profile: UserProfile | null;
  memberships: Membership[];
  allMembers: Member[];
  savedSources: SavedSource[];
  deletedRecipes: DeletedRecipe[];
  currentUserId: string;
  translationLanguage: string | null;
}

export function SettingsClient({ profile, memberships, allMembers, savedSources, deletedRecipes, currentUserId, translationLanguage: initialTranslationLanguage }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState(profile?.name ?? "");
  const [username, setUsername] = useState(profile?.username ?? "");
  const [saving, setSaving] = useState(false);

  const [inviteGalleyId] = useState(memberships[0]?.galley_id ?? "");
  const [sharingGalley, setSharingGalley] = useState(false);

  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourceType, setNewSourceType] = useState<"instagram" | "youtube" | "tiktok" | "website">("website");
  const [addingSource, setAddingSource] = useState(false);
  const [sources, setSources] = useState<SavedSource[]>(savedSources);

  const [members, setMembers] = useState<Member[]>(allMembers);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  const [deleted, setDeleted] = useState<DeletedRecipe[]>(deletedRecipes);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const [translationLanguage, setTranslationLanguage] = useState(initialTranslationLanguage ?? "");
  const [savingLanguage, setSavingLanguage] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [galleyInviteError, setGalleyInviteError] = useState("");

  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [deletedOpen, setDeletedOpen] = useState(false);

  async function saveProfile() {
    if (!profile) return;
    setSaving(true);
    await supabase
      .from("users")
      .update({ name, username })
      .eq("id", profile.id);
    setSaving(false);
    router.refresh();
  }

  async function saveTranslationLanguage() {
    if (!profile) return;
    setSavingLanguage(true);
    await supabase
      .from("users")
      .update({ translation_language: translationLanguage || null } as never)
      .eq("id", profile.id);
    setSavingLanguage(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  async function deleteAccount() {
    setDeleting(true);
    const res = await fetch("/api/account", { method: "DELETE" });
    if (res.ok) {
      // Session is now invalid — sign out client-side and redirect
      await supabase.auth.signOut();
      router.push("/auth/login");
    } else {
      const err = await res.json().catch(() => ({}));
      setDeleteError(err.error ?? "Failed to delete account. Please try again.");
      setDeleting(false);
    }
  }

  async function shareAppInvite() {
    const url = window.location.origin;
    const text = "Join me on Galley Book — a shared recipe library for families.";
    if (navigator.share) {
      try { await navigator.share({ title: "Galley Book", text, url }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(`${text} ${url}`);
    }
  }

  async function shareGalleyInvite() {
    if (!inviteGalleyId) return;
    setSharingGalley(true);
    try {
      const res = await fetch("/api/invites/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ galleyId: inviteGalleyId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setGalleyInviteError(err.error ?? "Failed to create invite link. Please try again.");
        return;
      }
      setGalleyInviteError("");
      const { url } = await res.json();
      const galleyName = firstGalley?.name ?? "our galley";
      if (navigator.share) {
        try { await navigator.share({ title: "Join our Galley", text: `Join "${galleyName}" on Galley Book`, url }); } catch { /* cancelled */ }
      } else {
        await navigator.clipboard.writeText(url);
      }
    } finally {
      setSharingGalley(false);
    }
  }

  async function addSource() {
    if (!newSourceUrl.trim()) return;
    setAddingSource(true);
    const res = await fetch("/api/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: newSourceUrl,
        sourceType: newSourceType,
        galleyId: inviteGalleyId,
      }),
    });
    if (res.ok) {
      const { source } = await res.json();
      setSources((prev) => [source, ...prev]);
      setNewSourceUrl("");
    }
    setAddingSource(false);
  }

  async function removeSource(id: string) {
    await fetch(`/api/sources/${id}`, { method: "DELETE" });
    setSources((prev) => prev.filter((s) => s.id !== id));
  }

  async function removeMember(userId: string) {
    if (!inviteGalleyId) return;
    setRemovingMemberId(userId);
    const res = await fetch(
      `/api/galleys/members/${userId}?galleyId=${inviteGalleyId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => !(m.galley_id === inviteGalleyId && m.user_id === userId)));
    }
    setRemovingMemberId(null);
  }

  async function restoreRecipe(id: string) {
    setRestoringId(id);
    const res = await fetch(`/api/recipes/${id}`, { method: "PATCH" });
    if (res.ok) {
      setDeleted((prev) => prev.filter((r) => r.id !== id));
    }
    setRestoringId(null);
  }

  const firstGalley = memberships[0]?.galleys;
  const isOwner = memberships[0]?.role === "owner";
  const galleyMembers = members.filter((m) => m.galley_id === inviteGalleyId);

  return (
    <div className="px-5 pt-12 pb-8 space-y-10">
      {/* Profile */}
      <section>
        <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-4">
          Profile
        </h2>
        <div className="flex flex-col items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-surface-low overflow-hidden">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-surface-highest">
                <span className="text-xl font-thin text-anthracite">
                  {name?.[0]?.toUpperCase() ?? "?"}
                </span>
              </div>
            )}
          </div>
          <p className="text-xs font-light text-on-surface-variant">{profile?.email}</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-anthracite uppercase tracking-wide block mb-1.5">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-anthracite uppercase tracking-wide block mb-1.5">
              Username
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="@username"
              className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none"
            />
          </div>
          <button
            onClick={saveProfile}
            disabled={saving}
            style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
            className="w-full border text-sm font-light py-3 rounded-full transition-opacity disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save Profile"}
          </button>
        </div>
      </section>

      {/* Galley Management */}
      {firstGalley && (
        <section>
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-4">
            Galley Management
          </h2>
          <div className="bg-surface-low rounded-md px-4 py-3 mb-4">
            <p className="text-xs font-light text-on-surface-variant mb-0.5">Current galley</p>
            <p className="text-sm font-semibold text-anthracite">{firstGalley.name}</p>
          </div>

          <div className="space-y-2">
            {galleyMembers.map((m) => (
              <div
                key={m.user_id}
                className="flex items-center gap-3 bg-surface-lowest rounded-md px-4 py-3 shadow-ambient"
              >
                <div className="w-9 h-9 rounded-full bg-surface-low overflow-hidden flex-shrink-0">
                  {m.users?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.users.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-xs font-semibold text-anthracite">
                        {m.users?.name?.[0]?.toUpperCase() ?? "?"}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-light text-anthracite truncate">
                    {m.users?.name ?? m.users?.email}
                  </p>
                  <p className="text-[10px] font-light text-on-surface-variant capitalize">{m.role}</p>
                </div>
                {isOwner && m.user_id !== currentUserId && (
                  <button
                    onClick={() => removeMember(m.user_id)}
                    disabled={removingMemberId === m.user_id}
                    className="flex-shrink-0 text-on-surface-variant/40 transition-opacity disabled:opacity-40"
                    aria-label="Remove member"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M10 4L4 10M4 4l6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Invite Someone */}
      {firstGalley && (
        <section>
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-4">
            Invite Someone
          </h2>
          <div className="space-y-2">
            <button
              onClick={shareAppInvite}
              className="w-full border border-anthracite bg-white text-anthracite text-sm font-light py-3 rounded-full"
            >
              Invite to Galley Book
            </button>
            <button
              onClick={shareGalleyInvite}
              disabled={sharingGalley || !inviteGalleyId}
              className="w-full border border-anthracite bg-white text-anthracite text-sm font-light py-3 rounded-full transition-opacity disabled:opacity-40"
            >
              {sharingGalley ? "Creating link…" : "Invite to this Galley"}
            </button>
            {galleyInviteError && (
              <p className="text-xs font-light text-red-500">{galleyInviteError}</p>
            )}
          </div>
        </section>
      )}

      {/* Recommendation Sources — collapsible */}
      <section>
        <button
          onClick={() => setSourcesOpen((o) => !o)}
          className="w-full flex items-center justify-between mb-4"
        >
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest">
            Recommendation Sources
          </h2>
          <svg
            width="16" height="16" viewBox="0 0 16 16" fill="none"
            className={`text-anthracite transition-transform duration-200 ${sourcesOpen ? "rotate-180" : ""}`}
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {sourcesOpen && (
          <>
            <p className="text-xs font-light text-on-surface-variant mb-4">
              Add Instagram accounts, YouTube channels, TikTok accounts, or websites to power your AI recommendations. Sources are also added automatically when you import a recipe via link.
            </p>

            <div className="space-y-2 mb-4">
              {sources.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 bg-surface-lowest rounded-md px-4 py-3 shadow-ambient"
                >
                  <span className="text-xs font-light text-on-surface-variant capitalize bg-surface-low px-2 py-0.5 rounded-full">
                    {s.source_type}
                  </span>
                  <p className="flex-1 text-sm font-light text-anthracite truncate">
                    {s.handle_or_name ?? s.url}
                  </p>
                  <button
                    onClick={() => removeSource(s.id)}
                    aria-label="Remove source"
                    className="p-3 -m-3 text-on-surface-variant/40"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M10 4L4 10M4 4l6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex gap-2">
                <select
                  value={newSourceType}
                  onChange={(e) => setNewSourceType(e.target.value as "instagram" | "youtube" | "tiktok" | "website")}
                  className="bg-white border border-[#252729] rounded-full px-3 py-3 text-xs font-light text-anthracite outline-none"
                >
                  <option value="instagram">Instagram</option>
                  <option value="youtube">YouTube</option>
                  <option value="tiktok">TikTok</option>
                  <option value="website">Website</option>
                </select>
                <input
                  value={newSourceUrl}
                  onChange={(e) => setNewSourceUrl(e.target.value)}
                  placeholder="URL or @handle"
                  className="flex-1 bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none"
                />
              </div>
              <button
                onClick={addSource}
                disabled={addingSource || !newSourceUrl.trim()}
                style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
                className="w-full border text-sm font-light py-3 rounded-full transition-opacity disabled:opacity-40"
              >
                {addingSource ? "Adding…" : "Add Source"}
              </button>
            </div>
          </>
        )}
      </section>

      {/* Deleted Recipes — collapsible */}
      <section>
        <button
          onClick={() => setDeletedOpen((o) => !o)}
          className="w-full flex items-center justify-between mb-4"
        >
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest">
            Deleted Recipes
          </h2>
          <svg
            width="16" height="16" viewBox="0 0 16 16" fill="none"
            className={`text-anthracite transition-transform duration-200 ${deletedOpen ? "rotate-180" : ""}`}
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {deletedOpen && (
          <div className="space-y-2">
            {deleted.length === 0 ? (
              <p className="text-xs font-light text-on-surface-variant">No deleted recipes.</p>
            ) : (
              deleted.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 bg-surface-lowest rounded-md px-4 py-3 shadow-ambient"
                >
                  <p className="flex-1 text-sm font-light text-anthracite truncate">{r.name}</p>
                  <button
                    onClick={() => restoreRecipe(r.id)}
                    disabled={restoringId === r.id}
                    className="flex-shrink-0 border border-anthracite bg-white text-anthracite text-xs font-light px-3 py-1.5 rounded-full transition-opacity disabled:opacity-40"
                  >
                    {restoringId === r.id ? "Restoring…" : "Restore"}
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      {/* Translation */}
      <section>
        <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-4">
          Translation
        </h2>
        <p className="text-xs font-light text-on-surface-variant mb-4">
          Choose a language to translate recipe descriptions, ingredients, and steps. Translation is optional and triggered per recipe.
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-anthracite uppercase tracking-wide block mb-1.5">
              Translation Language
            </label>
            <select
              value={translationLanguage}
              onChange={(e) => setTranslationLanguage(e.target.value)}
              className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite outline-none"
            >
              <option value="">No translation</option>
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={saveTranslationLanguage}
            disabled={savingLanguage}
            style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
            className="w-full border text-sm font-light py-3 rounded-full transition-opacity disabled:opacity-40"
          >
            {savingLanguage ? "Saving…" : "Save"}
          </button>
        </div>
      </section>

      {/* Preferences & Legal */}
      <section className="space-y-1">
        <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
          Preferences & Legal
        </h2>
        <Link href="/help" className="flex items-center gap-3 py-3 text-sm font-light text-anthracite">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M8 11v-1M8 6.5a1.5 1.5 0 10-1.5 1.5H8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          Help Center
        </Link>
        <Link href="/privacy" className="flex items-center gap-3 py-3 text-sm font-light text-anthracite">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 2L3 4v4c0 3 2.5 5.5 5 6 2.5-.5 5-3 5-6V4L8 2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
          </svg>
          Legal & Privacy
        </Link>
        <button
          onClick={signOut}
          className="flex items-center gap-3 py-3 text-sm font-light text-red-500 w-full text-left"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 14H3V2h3M10 11l3-3-3-3M13 8H6" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Sign Out
        </button>

        {/* Delete account — two-step confirmation */}
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-3 py-3 text-sm font-light text-on-surface-variant w-full text-left"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" stroke="#474747" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Delete Account
          </button>
        ) : (
          <div className="bg-surface-low rounded-md px-4 py-4 space-y-3 mt-1">
            <p className="text-xs font-light text-anthracite leading-relaxed">
              This will permanently delete your account, all your recipes, and all your data.
              This cannot be undone.
            </p>
            {deleteError && (
              <p className="text-xs font-light text-red-500">{deleteError}</p>
            )}
            <button
              onClick={deleteAccount}
              disabled={deleting}
              className="w-full bg-red-500 text-white text-sm font-light py-3 rounded-full transition-opacity disabled:opacity-40"
            >
              {deleting ? "Deleting…" : "Yes, delete my account"}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="w-full border border-anthracite bg-white text-anthracite text-sm font-light py-3 rounded-full"
            >
              Cancel
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
