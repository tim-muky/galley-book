"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { UserProfile, SavedSource } from "@/types/database";

interface Membership {
  galley_id: string;
  role: string;
  is_default: boolean;
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

export function SettingsClient({ profile, memberships: initialMemberships, allMembers, savedSources, deletedRecipes, currentUserId, translationLanguage: initialTranslationLanguage }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState(profile?.name ?? "");
  const [username, setUsername] = useState(profile?.username ?? "");
  const [saving, setSaving] = useState(false);

  const [memberships, setMemberships] = useState<Membership[]>(initialMemberships);
  const [members, setMembers] = useState<Member[]>(allMembers);

  // Track which galley sections are open (default: first one open)
  const [openGalleys, setOpenGalleys] = useState<Set<string>>(
    new Set(initialMemberships.length > 0 ? [initialMemberships[0].galley_id] : [])
  );

  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);
  const [deletingGalleyId, setDeletingGalleyId] = useState<string | null>(null);
  const [confirmDeleteGalleyId, setConfirmDeleteGalleyId] = useState<string | null>(null);
  const [leavingGalleyId, setLeavingGalleyId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [sharingGalleyId, setSharingGalleyId] = useState<string | null>(null);
  const [galleyInviteError, setGalleyInviteError] = useState("");

  const [editingGalleyId, setEditingGalleyId] = useState<string | null>(null);
  const [editingGalleyName, setEditingGalleyName] = useState("");
  const [renamingGalleyId, setRenamingGalleyId] = useState<string | null>(null);

  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourceType, setNewSourceType] = useState<"instagram" | "youtube" | "tiktok" | "website">("website");
  const [addingSource, setAddingSource] = useState(false);
  const [sources, setSources] = useState<SavedSource[]>(savedSources);

  const [deleted, setDeleted] = useState<DeletedRecipe[]>(deletedRecipes);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const [translationLanguage, setTranslationLanguage] = useState(initialTranslationLanguage ?? "");
  const [savingLanguage, setSavingLanguage] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [deletedOpen, setDeletedOpen] = useState(false);

  const [showCreateGalley, setShowCreateGalley] = useState(false);
  const [newGalleyName, setNewGalleyName] = useState("");
  const [creatingGalley, setCreatingGalley] = useState(false);
  const [createGalleyError, setCreateGalleyError] = useState("");

  // Default galley for sources section
  const defaultGalleyId = memberships.find((m) => m.is_default)?.galley_id ?? memberships[0]?.galley_id ?? "";

  function toggleGalley(galleyId: string) {
    setOpenGalleys((prev) => {
      const next = new Set(prev);
      if (next.has(galleyId)) next.delete(galleyId);
      else next.add(galleyId);
      return next;
    });
  }

  async function saveProfile() {
    if (!profile) return;
    setSaving(true);
    await supabase.from("users").update({ name, username }).eq("id", profile.id);
    setSaving(false);
    router.refresh();
  }

  async function saveTranslationLanguage() {
    if (!profile) return;
    setSavingLanguage(true);
    await supabase.from("users").update({ translation_language: translationLanguage || null } as never).eq("id", profile.id);
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

  async function shareGalleyInvite(galleyId: string, galleyName: string) {
    setSharingGalleyId(galleyId);
    setGalleyInviteError("");
    try {
      const res = await fetch("/api/invites/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ galleyId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setGalleyInviteError(err.error ?? "Failed to create invite link.");
        return;
      }
      const { url } = await res.json();
      if (navigator.share) {
        try { await navigator.share({ title: "Join our Galley", text: `Join "${galleyName}" on Galley Book`, url }); } catch { /* cancelled */ }
      } else {
        await navigator.clipboard.writeText(url);
      }
    } finally {
      setSharingGalleyId(null);
    }
  }

  async function setDefaultGalley(galleyId: string) {
    setSettingDefaultId(galleyId);
    const res = await fetch(`/api/galleys/${galleyId}/default`, { method: "PATCH" });
    if (res.ok) {
      setMemberships((prev) => prev.map((m) => ({ ...m, is_default: m.galley_id === galleyId })));
    }
    setSettingDefaultId(null);
  }

  async function deleteGalley(galleyId: string) {
    setDeletingGalleyId(galleyId);
    const res = await fetch(`/api/galleys/${galleyId}`, { method: "DELETE" });
    if (res.ok) {
      setMemberships((prev) => prev.filter((m) => m.galley_id !== galleyId));
      setMembers((prev) => prev.filter((m) => m.galley_id !== galleyId));
      setConfirmDeleteGalleyId(null);
    }
    setDeletingGalleyId(null);
  }

  async function leaveGalley(galleyId: string) {
    setLeavingGalleyId(galleyId);
    const res = await fetch(`/api/galleys/members/${currentUserId}?galleyId=${galleyId}`, { method: "DELETE" });
    if (res.ok) {
      setMemberships((prev) => prev.filter((m) => m.galley_id !== galleyId));
      setMembers((prev) => prev.filter((m) => m.galley_id !== galleyId));
    }
    setLeavingGalleyId(null);
  }

  async function renameGalley(galleyId: string) {
    if (!editingGalleyName.trim()) return;
    setRenamingGalleyId(galleyId);
    const res = await fetch(`/api/galleys/${galleyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editingGalleyName.trim() }),
    });
    if (res.ok) {
      setMemberships((prev) =>
        prev.map((m) =>
          m.galley_id === galleyId
            ? { ...m, galleys: { ...m.galleys!, name: editingGalleyName.trim() } }
            : m
        )
      );
      setEditingGalleyId(null);
    }
    setRenamingGalleyId(null);
  }

  async function removeMember(userId: string, galleyId: string) {
    setRemovingMemberId(userId);
    const res = await fetch(`/api/galleys/members/${userId}?galleyId=${galleyId}`, { method: "DELETE" });
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => !(m.galley_id === galleyId && m.user_id === userId)));
    }
    setRemovingMemberId(null);
  }

  async function addSource() {
    if (!newSourceUrl.trim() || !defaultGalleyId) return;
    setAddingSource(true);
    const res = await fetch("/api/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: newSourceUrl, sourceType: newSourceType, galleyId: defaultGalleyId }),
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

  async function restoreRecipe(id: string) {
    setRestoringId(id);
    const res = await fetch(`/api/recipes/${id}`, { method: "PATCH" });
    if (res.ok) setDeleted((prev) => prev.filter((r) => r.id !== id));
    setRestoringId(null);
  }

  async function createGalley() {
    if (!newGalleyName.trim()) return;
    setCreatingGalley(true);
    setCreateGalleyError("");
    const res = await fetch("/api/galleys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newGalleyName.trim() }),
    });
    if (res.ok) {
      const { id } = await res.json();
      const isFirst = memberships.length === 0;
      setMemberships((prev) => [
        ...prev,
        { galley_id: id, role: "owner", is_default: isFirst, galleys: { id, name: newGalleyName.trim() } },
      ]);
      setOpenGalleys((prev) => new Set([...prev, id]));
      setNewGalleyName("");
      setShowCreateGalley(false);
    } else {
      const err = await res.json().catch(() => ({}));
      setCreateGalleyError(err.error ?? "Failed to create galley.");
    }
    setCreatingGalley(false);
  }

  return (
    <div className="px-5 pt-12 pb-8 space-y-10">
      {/* Profile */}
      <section>
        <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-4">Profile</h2>
        <div className="flex flex-col items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-surface-low overflow-hidden">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-surface-highest">
                <span className="text-xl font-thin text-anthracite">{name?.[0]?.toUpperCase() ?? "?"}</span>
              </div>
            )}
          </div>
          <p className="text-xs font-light text-on-surface-variant">{profile?.email}</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-anthracite uppercase tracking-wide block mb-1.5">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite outline-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-anthracite uppercase tracking-wide block mb-1.5">Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@username"
              className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none" />
          </div>
          <button onClick={saveProfile} disabled={saving}
            style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
            className="w-full border text-sm font-light py-3 rounded-full transition-opacity disabled:opacity-40">
            {saving ? "Saving…" : "Save Profile"}
          </button>
        </div>
      </section>

      {/* Per-galley management */}
      <section>
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-4">Galleys</h2>
          <div className="space-y-3">
            {memberships.map((m) => {
              const galleyId = m.galley_id;
              const galleyName = m.galleys?.name ?? "Unnamed";
              const isOwner = m.role === "owner";
              const isDefault = m.is_default;
              const isOpen = openGalleys.has(galleyId);
              const galleyMembers = members.filter((mb) => mb.galley_id === galleyId);

              return (
                <div key={galleyId} className="bg-surface-lowest rounded-md shadow-ambient overflow-hidden">
                  {/* Collapsible header */}
                  {editingGalleyId === galleyId ? (
                    <div className="flex items-center gap-2 px-4 py-3">
                      <input
                        value={editingGalleyName}
                        onChange={(e) => setEditingGalleyName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") renameGalley(galleyId);
                          if (e.key === "Escape") setEditingGalleyId(null);
                        }}
                        autoFocus
                        className="flex-1 bg-white border border-[#252729] rounded-full px-3 py-1.5 text-sm font-light text-anthracite outline-none"
                      />
                      <button
                        onClick={() => renameGalley(galleyId)}
                        disabled={renamingGalleyId === galleyId || !editingGalleyName.trim()}
                        style={{ backgroundColor: "#252729", color: "#fff" }}
                        className="flex-shrink-0 text-xs font-light px-3 py-1.5 rounded-full transition-opacity disabled:opacity-40"
                      >
                        {renamingGalleyId === galleyId ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={() => setEditingGalleyId(null)}
                        className="flex-shrink-0 text-xs font-light text-on-surface-variant px-2 py-1.5"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                  <button
                    onClick={() => toggleGalley(galleyId)}
                    className="w-full flex items-center justify-between px-4 py-3.5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isDefault && (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="#252729" className="flex-shrink-0">
                          <path d="M6 1l1.3 2.7 3 .4-2.2 2.1.5 3L6 7.8 3.4 9.2l.5-3L1.7 4.1l3-.4L6 1z"/>
                        </svg>
                      )}
                      <span className="text-sm font-light text-anthracite truncate">{galleyName}</span>
                      <span className="text-[10px] font-light text-on-surface-variant capitalize flex-shrink-0">
                        {isOwner ? "owner" : "member"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isOwner && (
                        <span
                          role="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingGalleyId(galleyId);
                            setEditingGalleyName(galleyName);
                          }}
                          className="p-1 text-on-surface-variant/40 hover:text-anthracite transition-colors"
                          aria-label="Rename galley"
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </span>
                      )}
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                        className={`text-anthracite transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
                        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </button>
                  )}

                  {isOpen && (
                    <div className="px-4 pb-4 space-y-4">
                      {/* Members list */}
                      {galleyMembers.length > 0 && (
                        <div className="space-y-2">
                          {galleyMembers.map((mb) => (
                            <div key={mb.user_id} className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-surface-low overflow-hidden flex-shrink-0">
                                {mb.users?.avatar_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={mb.users.avatar_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <span className="text-xs font-semibold text-anthracite">{mb.users?.name?.[0]?.toUpperCase() ?? "?"}</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-light text-anthracite truncate">{mb.users?.name ?? mb.users?.email}</p>
                                <p className="text-[10px] font-light text-on-surface-variant capitalize">{mb.role}</p>
                              </div>
                              {isOwner && mb.user_id !== currentUserId && (
                                <button
                                  onClick={() => removeMember(mb.user_id, galleyId)}
                                  disabled={removingMemberId === mb.user_id}
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
                      )}

                      {/* Actions */}
                      <div className="space-y-2 pt-1">
                        {/* Invite */}
                        <button
                          onClick={() => shareGalleyInvite(galleyId, galleyName)}
                          disabled={sharingGalleyId === galleyId}
                          className="w-full border border-anthracite bg-white text-anthracite text-sm font-light py-3 rounded-full transition-opacity disabled:opacity-40"
                        >
                          {sharingGalleyId === galleyId ? "Creating link…" : "Invite to Galley"}
                        </button>

                        {/* Set as default */}
                        {!isDefault && (
                          <button
                            onClick={() => setDefaultGalley(galleyId)}
                            disabled={settingDefaultId === galleyId}
                            className="w-full border border-anthracite bg-white text-anthracite text-sm font-light py-3 rounded-full transition-opacity disabled:opacity-40"
                          >
                            {settingDefaultId === galleyId ? "Setting…" : "Set as Default"}
                          </button>
                        )}

                        {/* Owner: delete galley */}
                        {isOwner && confirmDeleteGalleyId !== galleyId && (
                          <button
                            onClick={() => setConfirmDeleteGalleyId(galleyId)}
                            className="w-full border border-red-300 bg-white text-red-500 text-sm font-light py-3 rounded-full"
                          >
                            Delete Galley
                          </button>
                        )}

                        {isOwner && confirmDeleteGalleyId === galleyId && (
                          <div className="bg-surface-low rounded-md px-4 py-4 space-y-3">
                            <p className="text-xs font-light text-anthracite leading-relaxed">
                              This will permanently delete &quot;{galleyName}&quot; and all its recipes. This cannot be undone.
                            </p>
                            <button
                              onClick={() => deleteGalley(galleyId)}
                              disabled={deletingGalleyId === galleyId}
                              className="w-full bg-red-500 text-white text-sm font-light py-3 rounded-full transition-opacity disabled:opacity-40"
                            >
                              {deletingGalleyId === galleyId ? "Deleting…" : "Yes, delete galley"}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteGalleyId(null)}
                              className="w-full border border-anthracite bg-white text-anthracite text-sm font-light py-3 rounded-full"
                            >
                              Cancel
                            </button>
                          </div>
                        )}

                        {/* Non-owner: leave galley */}
                        {!isOwner && (
                          <button
                            onClick={() => leaveGalley(galleyId)}
                            disabled={leavingGalleyId === galleyId}
                            className="w-full border border-red-300 bg-white text-red-500 text-sm font-light py-3 rounded-full transition-opacity disabled:opacity-40"
                          >
                            {leavingGalleyId === galleyId ? "Leaving…" : "Leave Galley"}
                          </button>
                        )}
                      </div>

                      {galleyInviteError && (
                        <p className="text-xs font-light text-red-500">{galleyInviteError}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Create Galley */}
          {showCreateGalley ? (
            <div className="bg-surface-low rounded-md px-4 py-4 space-y-3">
              <p className="text-xs font-semibold text-anthracite uppercase tracking-wide">New Galley</p>
              <input
                value={newGalleyName}
                onChange={(e) => setNewGalleyName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createGalley()}
                placeholder="Galley name"
                autoFocus
                className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none"
              />
              {createGalleyError && (
                <p className="text-xs font-light text-red-500">{createGalleyError}</p>
              )}
              <button
                onClick={createGalley}
                disabled={creatingGalley || !newGalleyName.trim()}
                style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
                className="w-full border text-sm font-light py-3 rounded-full transition-opacity disabled:opacity-40"
              >
                {creatingGalley ? "Creating…" : "Create Galley"}
              </button>
              <button
                onClick={() => { setShowCreateGalley(false); setNewGalleyName(""); setCreateGalleyError(""); }}
                className="w-full border border-anthracite bg-white text-anthracite text-sm font-light py-3 rounded-full"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCreateGalley(true)}
              className="w-full border border-anthracite bg-white text-anthracite text-sm font-light py-3 rounded-full"
            >
              Create Galley
            </button>
          )}

        <button
          onClick={shareAppInvite}
          className="w-full border border-anthracite bg-white text-anthracite text-sm font-light py-3 rounded-full mt-3"
        >
          Invite someone to Galley Book
        </button>
      </section>

      {/* Recommendation Sources — collapsible */}
      <section>
        <button onClick={() => setSourcesOpen((o) => !o)} className="w-full flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest">Recommendation Sources</h2>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={`text-anthracite transition-transform duration-200 ${sourcesOpen ? "rotate-180" : ""}`}>
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {sourcesOpen && (
          <>
            <p className="text-xs font-light text-on-surface-variant mb-4">
              Add Instagram accounts, YouTube channels, TikTok accounts, or websites to power your AI recommendations.
            </p>
            <div className="space-y-2 mb-4">
              {sources.map((s) => (
                <div key={s.id} className="flex items-center gap-3 bg-surface-lowest rounded-md px-4 py-3 shadow-ambient">
                  <span className="text-xs font-light text-on-surface-variant capitalize bg-surface-low px-2 py-0.5 rounded-full">{s.source_type}</span>
                  <p className="flex-1 text-sm font-light text-anthracite truncate">{s.handle_or_name ?? s.url}</p>
                  <button onClick={() => removeSource(s.id)} aria-label="Remove source" className="p-3 -m-3 text-on-surface-variant/40">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M10 4L4 10M4 4l6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                  </button>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <div className="flex gap-2">
                <select value={newSourceType} onChange={(e) => setNewSourceType(e.target.value as "instagram" | "youtube" | "tiktok" | "website")}
                  className="bg-white border border-[#252729] rounded-full px-3 py-3 text-xs font-light text-anthracite outline-none">
                  <option value="instagram">Instagram</option>
                  <option value="youtube">YouTube</option>
                  <option value="tiktok">TikTok</option>
                  <option value="website">Website</option>
                </select>
                <input value={newSourceUrl} onChange={(e) => setNewSourceUrl(e.target.value)} placeholder="URL or @handle"
                  className="flex-1 bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none" />
              </div>
              <button onClick={addSource} disabled={addingSource || !newSourceUrl.trim()}
                style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
                className="w-full border text-sm font-light py-3 rounded-full transition-opacity disabled:opacity-40">
                {addingSource ? "Adding…" : "Add Source"}
              </button>
            </div>
          </>
        )}
      </section>

      {/* Deleted Recipes — collapsible */}
      <section>
        <button onClick={() => setDeletedOpen((o) => !o)} className="w-full flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest">Deleted Recipes</h2>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={`text-anthracite transition-transform duration-200 ${deletedOpen ? "rotate-180" : ""}`}>
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {deletedOpen && (
          <div className="space-y-2">
            {deleted.length === 0 ? (
              <p className="text-xs font-light text-on-surface-variant">No deleted recipes.</p>
            ) : (
              deleted.map((r) => (
                <div key={r.id} className="flex items-center gap-3 bg-surface-lowest rounded-md px-4 py-3 shadow-ambient">
                  <p className="flex-1 text-sm font-light text-anthracite truncate">{r.name}</p>
                  <button onClick={() => restoreRecipe(r.id)} disabled={restoringId === r.id}
                    className="flex-shrink-0 border border-anthracite bg-white text-anthracite text-xs font-light px-3 py-1.5 rounded-full transition-opacity disabled:opacity-40">
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
        <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-4">Translation</h2>
        <p className="text-xs font-light text-on-surface-variant mb-4">
          Choose a language to translate recipe descriptions, ingredients, and steps.
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-anthracite uppercase tracking-wide block mb-1.5">Translation Language</label>
            <select value={translationLanguage} onChange={(e) => setTranslationLanguage(e.target.value)}
              className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite outline-none">
              <option value="">No translation</option>
              {LANGUAGES.map((lang) => <option key={lang.code} value={lang.code}>{lang.name}</option>)}
            </select>
          </div>
          <button onClick={saveTranslationLanguage} disabled={savingLanguage}
            style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
            className="w-full border text-sm font-light py-3 rounded-full transition-opacity disabled:opacity-40">
            {savingLanguage ? "Saving…" : "Save"}
          </button>
        </div>
      </section>

      {/* Preferences & Legal */}
      <section className="space-y-1">
        <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">Preferences & Legal</h2>
        <Link href="/help" className="flex items-center gap-3 py-3 text-sm font-light text-anthracite">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2"/><path d="M8 11v-1M8 6.5a1.5 1.5 0 10-1.5 1.5H8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
          Help Center
        </Link>
        <Link href="/privacy" className="flex items-center gap-3 py-3 text-sm font-light text-anthracite">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2L3 4v4c0 3 2.5 5.5 5 6 2.5-.5 5-3 5-6V4L8 2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
          Legal & Privacy
        </Link>
        <button onClick={signOut} className="flex items-center gap-3 py-3 text-sm font-light text-red-500 w-full text-left">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 14H3V2h3M10 11l3-3-3-3M13 8H6" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Sign Out
        </button>

        {!showDeleteConfirm ? (
          <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-3 py-3 text-sm font-light text-on-surface-variant w-full text-left">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" stroke="#474747" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Delete Account
          </button>
        ) : (
          <div className="bg-surface-low rounded-md px-4 py-4 space-y-3 mt-1">
            <p className="text-xs font-light text-anthracite leading-relaxed">
              This will permanently delete your account, all your recipes, and all your data. This cannot be undone.
            </p>
            {deleteError && <p className="text-xs font-light text-red-500">{deleteError}</p>}
            <button onClick={deleteAccount} disabled={deleting}
              className="w-full bg-red-500 text-white text-sm font-light py-3 rounded-full transition-opacity disabled:opacity-40">
              {deleting ? "Deleting…" : "Yes, delete my account"}
            </button>
            <button onClick={() => setShowDeleteConfirm(false)}
              className="w-full border border-anthracite bg-white text-anthracite text-sm font-light py-3 rounded-full">
              Cancel
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
