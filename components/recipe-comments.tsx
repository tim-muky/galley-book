"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type CommentItem = {
  id: string;
  body: string;
  created_at: string;
  author_id: string | null;
  author_name: string | null;
  author_avatar_url: string | null;
};

export function RecipeComments({
  recipeId,
  initialComments,
  currentUserId,
  isGalleyOwner,
  labels,
}: {
  recipeId: string;
  initialComments: CommentItem[];
  currentUserId: string;
  isGalleyOwner: boolean;
  labels: {
    heading: string;
    placeholder: string;
    post: string;
    posting: string;
    delete: string;
    empty: string;
  };
}) {
  const router = useRouter();
  const [comments, setComments] = useState<CommentItem[]>(initialComments);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function postComment() {
    const trimmed = body.trim();
    if (!trimmed || posting) return;
    setPosting(true);
    const res = await fetch(`/api/recipes/${recipeId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: trimmed }),
    });
    setPosting(false);
    if (!res.ok) return;
    const created = (await res.json()) as Omit<CommentItem, "author_name" | "author_avatar_url">;
    const me = comments.find((c) => c.author_id === currentUserId);
    setComments([
      ...comments,
      {
        ...created,
        author_name: me?.author_name ?? null,
        author_avatar_url: me?.author_avatar_url ?? null,
      },
    ]);
    setBody("");
    router.refresh();
  }

  async function deleteComment(commentId: string) {
    if (deletingId) return;
    setDeletingId(commentId);
    const res = await fetch(`/api/recipes/${recipeId}/comments/${commentId}`, {
      method: "DELETE",
    });
    setDeletingId(null);
    if (!res.ok) return;
    setComments(comments.filter((c) => c.id !== commentId));
    router.refresh();
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-light text-anthracite">{labels.heading}</h2>

      {comments.length === 0 ? (
        <p className="text-sm font-light text-on-surface-variant/60">{labels.empty}</p>
      ) : (
        <ul className="space-y-4">
          {comments.map((c) => {
            const canDelete = c.author_id === currentUserId || isGalleyOwner;
            return (
              <li key={c.id} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-surface-low overflow-hidden flex-shrink-0">
                  {c.author_avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.author_avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-surface-highest">
                      <span className="text-[10px] font-semibold text-anthracite">
                        {c.author_name?.[0]?.toUpperCase() ?? "?"}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold text-anthracite">
                      {c.author_name ?? "—"}
                    </span>
                    <time className="text-[10px] font-light text-on-surface-variant/60">
                      {new Date(c.created_at).toLocaleDateString()}
                    </time>
                  </div>
                  <p className="text-sm font-light text-anthracite/80 mt-1 whitespace-pre-wrap break-words">
                    {c.body}
                  </p>
                  {canDelete && (
                    <button
                      onClick={() => deleteComment(c.id)}
                      disabled={deletingId === c.id}
                      className="text-[10px] font-light text-on-surface-variant/60 mt-1 disabled:opacity-40"
                    >
                      {labels.delete}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={labels.placeholder}
          rows={3}
          maxLength={2000}
          className="w-full bg-[#E2E2E2] rounded-md px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none resize-none"
        />
        <button
          onClick={postComment}
          disabled={posting || !body.trim()}
          style={
            posting || !body.trim()
              ? { backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }
              : { backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }
          }
          className="border text-sm font-light px-6 py-2 rounded-full disabled:opacity-40"
        >
          {posting ? labels.posting : labels.post}
        </button>
      </div>
    </section>
  );
}
