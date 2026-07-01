"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Database } from "@/types/database";
import type { AdVariant } from "@/lib/marketing/ad-copy";
import type { ReelScript } from "@/lib/marketing/reel-script";

type Distribution = Database["public"]["Tables"]["galley_distributions"]["Row"];

function publicUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/recipe-photos/${path}`;
}

export function DistributeClient({
  runId,
  galleyId,
  galleyName,
  initialDistribution,
  channels,
}: {
  runId: string;
  galleyId: string;
  galleyName: string;
  initialDistribution: Distribution | null;
  /** Channels chosen on the run screen (GAL-456). null/empty → show all. */
  channels?: string[] | null;
}) {
  // Which channel sections to render. With no selection (e.g. direct nav) we
  // fall back to showing every channel, so the screen is never empty.
  const showAll = !channels || channels.length === 0;
  const showIg = showAll || channels.includes("instagram");
  const showTikTok = showAll || channels.includes("tiktok");
  const showFb = showAll || channels.includes("facebook");
  const showMeta = showAll || channels.includes("meta");
  const [dist, setDist] = useState<Distribution | null>(initialDistribution);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postingTikTok, setPostingTikTok] = useState(false);
  const [postingFb, setPostingFb] = useState(false);
  const [renderingReel, setRenderingReel] = useState(false);
  const [postingReel, setPostingReel] = useState(false);
  const [reelUrl, setReelUrl] = useState<string | null>(
    initialDistribution?.video_path
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/recipe-photos/${initialDistribution.video_path}`
      : null,
  );
  const [pushing, setPushing] = useState(false);
  const [proofing, setProofing] = useState(false);
  const [proof, setProof] = useState<{
    ok: boolean;
    issues: { severity: "error" | "warning"; area: string; slide: number | null; detail: string }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [postTitle, setPostTitle] = useState(initialDistribution?.post_title ?? "");
  const [captionDe, setCaptionDe] = useState(initialDistribution?.caption_de ?? "");
  const [captionEn, setCaptionEn] = useState(initialDistribution?.caption_en ?? "");
  const [postLocale, setPostLocale] = useState<"de" | "en">("de");
  const [scripts, setScripts] = useState<ReelScript[] | null>(null);
  const [scripting, setScripting] = useState(false);

  const carouselPaths = (dist?.carousel_paths as string[] | null) ?? [];
  const adVariants = (dist?.ad_variants as AdVariant[] | null) ?? [];

  async function generateAssets() {
    setGenerating(true);
    setError(null);
    const res = await fetch(
      `/api/admin/campaign-studio/runs/${runId}/distribute/generate-assets`,
      { method: "POST" },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Failed to generate assets");
    } else {
      setDist(body.distribution);
      setPostTitle(body.distribution.post_title ?? "");
      setCaptionDe(body.distribution.caption_de ?? "");
      setCaptionEn(body.distribution.caption_en ?? "");
    }
    setGenerating(false);
  }

  async function saveCaptions() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/campaign-studio/runs/${runId}/distribute`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post_title: postTitle, caption_de: captionDe, caption_en: captionEn }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error ?? "Failed to save captions");
    else setDist(body.distribution);
    setSaving(false);
  }

  async function pushToMeta() {
    setPushing(true);
    setError(null);
    const res = await fetch(
      `/api/admin/campaign-studio/runs/${runId}/distribute/meta-push`,
      { method: "POST" },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Failed to push to Meta");
    } else if (dist) {
      setDist({ ...dist, meta_status: "pushed", meta_creative_ids: body.pushed, meta_error: null });
    }
    setPushing(false);
  }

  async function postToInstagram() {
    setPosting(true);
    setError(null);
    const res = await fetch(
      `/api/admin/campaign-studio/runs/${runId}/distribute/instagram`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: postLocale }),
      },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Failed to post to Instagram");
    } else if (dist) {
      setDist({ ...dist, ig_status: "published", ig_post_id: body.igPostId, ig_error: null });
    }
    setPosting(false);
  }

  async function postToTikTok() {
    setPostingTikTok(true);
    setError(null);
    const res = await fetch(
      `/api/admin/campaign-studio/runs/${runId}/distribute/tiktok`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: postLocale }),
      },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Failed to post to TikTok");
    } else if (dist) {
      setDist({ ...dist, tiktok_status: "published", tiktok_post_id: body.publishId, tiktok_error: null });
    }
    setPostingTikTok(false);
  }

  async function postReelToTikTok() {
    setPostingTikTok(true);
    setError(null);
    const res = await fetch(`/api/admin/campaign-studio/runs/${runId}/distribute/tiktok`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: postLocale, action: "video" }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Failed to post reel to TikTok");
    } else if (dist) {
      setDist({ ...dist, tiktok_status: "published", tiktok_post_id: body.publishId, tiktok_error: null });
    }
    setPostingTikTok(false);
  }

  async function postToFacebook() {
    setPostingFb(true);
    setError(null);
    const res = await fetch(
      `/api/admin/campaign-studio/runs/${runId}/distribute/facebook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: postLocale }),
      },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Failed to post to Facebook");
    } else if (dist) {
      setDist({ ...dist, fb_status: "published", fb_post_id: body.postId, fb_error: null });
    }
    setPostingFb(false);
  }

  async function renderReel() {
    setRenderingReel(true);
    setError(null);
    const res = await fetch(`/api/admin/campaign-studio/runs/${runId}/distribute/reel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "render" }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error ?? "Failed to render reel");
    else setReelUrl(`${body.videoUrl}?t=${Date.now()}`);
    setRenderingReel(false);
  }

  async function postReel() {
    setPostingReel(true);
    setError(null);
    const res = await fetch(`/api/admin/campaign-studio/runs/${runId}/distribute/reel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "publish", locale: postLocale }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Failed to post reel");
    } else if (dist) {
      setDist({ ...dist, reel_status: "published", reel_post_id: body.igPostId, reel_error: null });
    }
    setPostingReel(false);
  }

  async function runProofread() {
    setProofing(true);
    setError(null);
    setProof(null);
    const res = await fetch(`/api/admin/campaign-studio/runs/${runId}/distribute/proofread`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: postLocale }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error ?? "Proofread failed");
    else setProof(body);
    setProofing(false);
  }

  async function generateScripts() {
    setScripting(true);
    setError(null);
    const res = await fetch(
      `/api/admin/campaign-studio/runs/${runId}/distribute/reel-scripts`,
      { method: "POST" },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error ?? "Failed to generate reel scripts");
    else setScripts(body.scripts);
    setScripting(false);
  }

  return (
    <div>
      <Link
        href={`/admin/campaign-studio/runs/${runId}`}
        className="text-xs font-light text-on-surface-variant"
      >
        ← Run
      </Link>
      <h1 className="text-4xl font-thin text-anthracite mt-1 mb-1">Distribute</h1>
      <p className="text-xs font-light text-on-surface-variant mb-6">{galleyName}</p>

      {error && <p className="text-xs font-light text-red-600 mb-4">{error}</p>}

      {/* No assets yet */}
      {!dist && (
        <div className="bg-white rounded-md p-4 shadow-ambient">
          <p className="text-sm font-light text-anthracite mb-3">
            Generate the IG carousel + ad creative for this galley.
          </p>
          <button
            type="button"
            onClick={generateAssets}
            disabled={generating}
            className="w-full border border-anthracite bg-anthracite text-white text-sm font-light py-3 rounded-full disabled:opacity-40"
          >
            {generating ? "Generating assets…" : "Generate carousel + ad copy"}
          </button>
        </div>
      )}

      {dist && (
        <>
          {/* Carousel preview */}
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
            Carousel ({carouselPaths.length} slides)
          </p>
          <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
            {carouselPaths.map((path, i) => (
              <div
                key={path}
                className="relative shrink-0 rounded-md overflow-hidden bg-surface-low"
                style={{ width: 144, height: 180 }}
              >
                <Image src={publicUrl(path)} alt={`Slide ${i + 1}`} fill unoptimized className="object-cover" />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={generateAssets}
            disabled={generating}
            className="border border-anthracite bg-white text-anthracite text-[11px] font-light py-1.5 px-4 rounded-full disabled:opacity-40 mb-6"
          >
            {generating ? "Regenerating…" : "Regenerate assets"}
          </button>

          {/* Post title */}
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
            Post title
          </p>
          <input
            value={postTitle}
            onChange={(e) => setPostTitle(e.target.value)}
            placeholder="Catchy post title"
            className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite outline-none mb-4"
          />

          {/* Caption editor */}
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
            Captions
          </p>
          <div className="flex flex-col gap-3 mb-3">
            <textarea
              value={captionDe}
              onChange={(e) => setCaptionDe(e.target.value)}
              rows={5}
              placeholder="Deutsche Caption"
              className="w-full bg-white border border-[#252729] rounded-md px-4 py-3 text-sm font-light text-anthracite outline-none"
            />
            <textarea
              value={captionEn}
              onChange={(e) => setCaptionEn(e.target.value)}
              rows={5}
              placeholder="English caption"
              className="w-full bg-white border border-[#252729] rounded-md px-4 py-3 text-sm font-light text-anthracite outline-none"
            />
          </div>
          <button
            type="button"
            onClick={saveCaptions}
            disabled={saving}
            className="border border-anthracite bg-white text-anthracite text-[11px] font-light py-1.5 px-4 rounded-full disabled:opacity-40 mb-6"
          >
            {saving ? "Saving…" : "Save captions"}
          </button>

          {/* Comment → DM mechanic (GAL-433) — trigger word + the DM auto-reply
              copy to paste into ManyChat / IG native auto-reply. */}
          {(dist.comment_trigger || dist.dm_reply_de || dist.dm_reply_en) && (
            <div className="bg-surface-low rounded-md p-4 mb-6">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
                Comment → DM mechanic
              </p>
              {dist.comment_trigger && (
                <p className="text-sm font-light text-anthracite mb-2">
                  Trigger word:{" "}
                  <code className="text-xs font-semibold tracking-wide">{dist.comment_trigger}</code>
                </p>
              )}
              {dist.dm_reply_de && (
                <p className="text-xs font-light text-on-surface-variant whitespace-pre-line mb-2">
                  <span className="font-semibold">DM (DE): </span>
                  {dist.dm_reply_de}
                </p>
              )}
              {dist.dm_reply_en && (
                <p className="text-xs font-light text-on-surface-variant whitespace-pre-line mb-2">
                  <span className="font-semibold">DM (EN): </span>
                  {dist.dm_reply_en}
                </p>
              )}
              <p className="text-[11px] font-light text-on-surface-variant">
                Native automation: when someone comments the trigger word on the posted carousel,
                galleybook auto-DMs this reply (comment → DM webhook). Goes live once Meta approves
                the messaging permission — until then it only replies to comments from accounts with
                a role on the app, so use your own account to test.
              </p>
            </div>
          )}

          {/* Proofread before posting (GAL-457) */}
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-6 mb-2">
            Proofread before posting
          </p>
          <div className="bg-white rounded-md p-4 shadow-ambient mb-6">
            <button
              type="button"
              onClick={runProofread}
              disabled={proofing || carouselPaths.length < 1}
              className="border border-anthracite bg-white text-anthracite text-[11px] font-light py-1.5 px-4 rounded-full disabled:opacity-40"
            >
              {proofing ? "Proofreading…" : `Proofread ${postLocale.toUpperCase()} (slides + caption)`}
            </button>
            {proof &&
              (proof.ok && proof.issues.length === 0 ? (
                <p className="text-xs font-light text-green-700 mt-3">
                  ✓ Looks clean — no issues found.
                </p>
              ) : (
                <div className="mt-3 flex flex-col gap-1.5">
                  {!proof.ok && (
                    <p className="text-xs font-light text-red-600">
                      ⚠ Issues found — review before posting.
                    </p>
                  )}
                  {proof.issues.map((iss, i) => (
                    <p key={i} className="text-xs font-light">
                      <span className={iss.severity === "error" ? "text-red-600" : "text-amber-700"}>
                        {iss.severity === "error" ? "✗" : "⚠"} {iss.area}
                        {iss.slide != null ? ` · slide ${iss.slide}` : " · caption"}:
                      </span>{" "}
                      <span className="text-on-surface-variant">{iss.detail}</span>
                    </p>
                  ))}
                </div>
              ))}
            <p className="text-[11px] font-light text-on-surface-variant mt-2">
              AI vision check of the rendered slides + caption (typos, garbled or clipped text,
              wrong language). Advisory — you decide whether to post.
            </p>
          </div>

          {/* Instagram post */}
          {showIg && (
          <>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
            Instagram
          </p>
          {dist.ig_status === "published" && dist.ig_post_id ? (
            <div className="bg-white rounded-md p-4 shadow-ambient">
              <p className="text-sm font-light text-anthracite mb-1">Published ✓</p>
              <p className="text-xs font-light text-on-surface-variant mb-2">
                Media id <code className="text-[10px]">{dist.ig_post_id}</code>
              </p>
              <a
                href="https://instagram.com/galleybook"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-light text-anthracite underline"
              >
                Open @galleybook →
              </a>
            </div>
          ) : (
            <div className="bg-white rounded-md p-4 shadow-ambient">
              {dist.ig_status === "failed" && dist.ig_error && (
                <p className="text-xs font-light text-red-600 mb-3">Last attempt failed: {dist.ig_error}</p>
              )}
              <div className="flex gap-2 mb-3">
                {(["de", "en"] as const).map((loc) => {
                  const active = postLocale === loc;
                  return (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => setPostLocale(loc)}
                      className="border text-xs font-light py-2 px-4 rounded-full"
                      style={{
                        backgroundColor: active ? "#252729" : "#fff",
                        color: active ? "#fff" : "#252729",
                        borderColor: "#252729",
                      }}
                    >
                      {loc.toUpperCase()} caption
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={postToInstagram}
                disabled={posting || carouselPaths.length < 2}
                className="w-full border border-anthracite bg-anthracite text-white text-sm font-light py-3 rounded-full disabled:opacity-40"
              >
                {posting ? "Posting to Instagram…" : "Post carousel to Instagram"}
              </button>
            </div>
          )}

          </>
          )}

          {/* Reel (Instagram) — slides + music slideshow video (GAL-452). */}
          {showIg && (
          <>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-6 mb-2">
            Reel (Instagram)
          </p>
          <div className="bg-white rounded-md p-4 shadow-ambient">
            {dist.reel_status === "failed" && dist.reel_error && (
              <p className="text-xs font-light text-red-600 mb-3">Last attempt failed: {dist.reel_error}</p>
            )}
            <button
              type="button"
              onClick={renderReel}
              disabled={renderingReel || carouselPaths.length < 1}
              className="border border-anthracite bg-white text-anthracite text-[11px] font-light py-1.5 px-4 rounded-full disabled:opacity-40 mb-3"
            >
              {renderingReel ? "Rendering reel…" : reelUrl ? "Re-render reel" : "Generate reel"}
            </button>
            {reelUrl && (
              <video
                src={reelUrl}
                poster={carouselPaths[0] ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/recipe-photos/${carouselPaths[0]}` : undefined}
                controls
                preload="metadata"
                playsInline
                className="w-40 rounded-md mb-3 bg-surface-low"
                style={{ aspectRatio: "9 / 16" }}
              />
            )}
            {dist.reel_status === "published" && dist.reel_post_id ? (
              <div>
                <p className="text-sm font-light text-anthracite mb-1">Reel published ✓</p>
                <p className="text-xs font-light text-on-surface-variant">
                  Media id <code className="text-[10px]">{dist.reel_post_id}</code>
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={postReel}
                disabled={postingReel || !reelUrl}
                className="w-full border border-anthracite bg-anthracite text-white text-sm font-light py-3 rounded-full disabled:opacity-40"
              >
                {postingReel ? "Posting reel…" : "Post reel to Instagram"}
              </button>
            )}
            <p className="text-[11px] font-light text-on-surface-variant mt-2">
              A 9:16 slideshow of the carousel slides (CTA included) with background music from
              <code className="text-[10px]"> public/audio</code>. Silent if no track is present.
            </p>
          </div>
          </>
          )}

          {/* TikTok post — publishes the same carousel as a TikTok photo post. */}
          {showTikTok && (
          <>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-6 mb-2">
            TikTok
          </p>
          {dist.tiktok_status === "published" && dist.tiktok_post_id ? (
            <div className="bg-white rounded-md p-4 shadow-ambient">
              <p className="text-sm font-light text-anthracite mb-1">Published ✓</p>
              <p className="text-xs font-light text-on-surface-variant mb-2">
                Publish id <code className="text-[10px]">{dist.tiktok_post_id}</code>
              </p>
              <a
                href="https://tiktok.com/@galleybook"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-light text-anthracite underline"
              >
                Open @galleybook →
              </a>
            </div>
          ) : (
            <div className="bg-white rounded-md p-4 shadow-ambient">
              {dist.tiktok_status === "failed" && dist.tiktok_error && (
                <p className="text-xs font-light text-red-600 mb-3">Last attempt failed: {dist.tiktok_error}</p>
              )}
              <div className="flex gap-2 mb-3">
                {(["de", "en"] as const).map((loc) => {
                  const active = postLocale === loc;
                  return (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => setPostLocale(loc)}
                      className="border text-xs font-light py-2 px-4 rounded-full"
                      style={{
                        backgroundColor: active ? "#252729" : "#fff",
                        color: active ? "#fff" : "#252729",
                        borderColor: "#252729",
                      }}
                    >
                      {loc.toUpperCase()} caption
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={postToTikTok}
                  disabled={postingTikTok || carouselPaths.length < 1}
                  className="w-full border border-anthracite bg-anthracite text-white text-sm font-light py-3 rounded-full disabled:opacity-40"
                >
                  {postingTikTok ? "Posting to TikTok…" : "Post carousel to TikTok (photo)"}
                </button>
                <button
                  type="button"
                  onClick={postReelToTikTok}
                  disabled={postingTikTok || !reelUrl}
                  className="w-full border border-anthracite bg-white text-anthracite text-sm font-light py-3 rounded-full disabled:opacity-40"
                  title={reelUrl ? undefined : "Render the reel first in the Reel section"}
                >
                  {postingTikTok ? "Posting…" : "Post reel to TikTok (video)"}
                </button>
              </div>
              <p className="text-[11px] font-light text-on-surface-variant mt-2">
                Photo = the carousel slides; video = the rendered reel (TikTok&apos;s native
                format — render it in the Reel section first). Until the app passes TikTok&apos;s
                Content Posting audit, posts publish privately (visible only to the account).
              </p>
            </div>
          )}

          </>
          )}

          {/* Facebook Page post — publishes the same carousel as a multi-photo post. */}
          {showFb && (
          <>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-6 mb-2">
            Facebook
          </p>
          {dist.fb_status === "published" && dist.fb_post_id ? (
            <div className="bg-white rounded-md p-4 shadow-ambient">
              <p className="text-sm font-light text-anthracite mb-1">Published ✓</p>
              <p className="text-xs font-light text-on-surface-variant mb-2">
                Post id <code className="text-[10px]">{dist.fb_post_id}</code>
              </p>
              <a
                href="https://facebook.com/galleybook"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-light text-anthracite underline"
              >
                Open galleybook on Facebook →
              </a>
            </div>
          ) : (
            <div className="bg-white rounded-md p-4 shadow-ambient">
              {dist.fb_status === "failed" && dist.fb_error && (
                <p className="text-xs font-light text-red-600 mb-3">Last attempt failed: {dist.fb_error}</p>
              )}
              <div className="flex gap-2 mb-3">
                {(["de", "en"] as const).map((loc) => {
                  const active = postLocale === loc;
                  return (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => setPostLocale(loc)}
                      className="border text-xs font-light py-2 px-4 rounded-full"
                      style={{
                        backgroundColor: active ? "#252729" : "#fff",
                        color: active ? "#fff" : "#252729",
                        borderColor: "#252729",
                      }}
                    >
                      {loc.toUpperCase()} caption
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={postToFacebook}
                disabled={postingFb || carouselPaths.length < 1}
                className="w-full border border-anthracite bg-anthracite text-white text-sm font-light py-3 rounded-full disabled:opacity-40"
              >
                {postingFb ? "Posting to Facebook…" : "Post carousel to Facebook"}
              </button>
              <p className="text-[11px] font-light text-on-surface-variant mt-2">
                Posts the slides as a multi-photo update to the galleybook Facebook Page.
              </p>
            </div>
          )}
          </>
          )}

          {/* Ad creative variants (Meta push lands with GAL-391) */}
          {showMeta && adVariants.length > 0 && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-6 mb-2">
                Ad creative ({adVariants.length} variants)
              </p>
              <div className="flex flex-col gap-2 mb-4">
                {adVariants.map((v, i) => (
                  <div key={i} className="bg-white rounded-md p-3 shadow-ambient">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-1">
                      {v.format}
                    </p>
                    <p className="text-sm font-light text-anthracite">{v.headline}</p>
                    <p className="text-xs font-light text-on-surface-variant">{v.primaryText}</p>
                  </div>
                ))}
              </div>
              {dist.meta_status === "pushed" ? (
                <div className="bg-white rounded-md p-4 shadow-ambient">
                  <p className="text-sm font-light text-anthracite mb-1">Pushed to Meta ✓</p>
                  <p className="text-xs font-light text-on-surface-variant">
                    {((dist.meta_creative_ids as unknown[]) ?? []).length} ads created · paused ·
                    manage budget/launch from the dashboard
                  </p>
                </div>
              ) : (
                <div className="bg-white rounded-md p-4 shadow-ambient">
                  {dist.meta_status === "failed" && dist.meta_error && (
                    <p className="text-xs font-light text-red-600 mb-3">
                      Last push failed: {dist.meta_error}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={pushToMeta}
                    disabled={pushing || carouselPaths.length === 0}
                    className="w-full border border-anthracite bg-white text-anthracite text-sm font-light py-3 rounded-full disabled:opacity-40"
                  >
                    {pushing ? "Pushing to Meta…" : "Push ad creatives to Meta (paused)"}
                  </button>
                  <p className="text-[11px] font-light text-on-surface-variant mt-2">
                    Creates paused ads in the Advantage+ campaign. Nothing spends until you launch
                    from the dashboard.
                  </p>
                </div>
              )}
            </>
          )}

          {/* Reel / TikTok scripts (GAL-434) — copy-paste filming scripts.
              Not persisted; regenerate any time. */}
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-6 mb-2">
            Reel / TikTok scripts
          </p>
          <div className="bg-white rounded-md p-4 shadow-ambient mb-4">
            <button
              type="button"
              onClick={generateScripts}
              disabled={scripting}
              className="border border-anthracite bg-white text-anthracite text-[11px] font-light py-1.5 px-4 rounded-full disabled:opacity-40"
            >
              {scripting ? "Writing scripts…" : scripts ? "Regenerate scripts" : "Generate reel scripts"}
            </button>
            {scripts && scripts.length > 0 && (
              <div className="flex flex-col gap-3 mt-3">
                {scripts.map((s, i) => (
                  <div key={i} className="bg-surface-low rounded-md p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-1">
                      {s.angle}
                      {s.trigger ? ` · ${s.trigger}` : ""}
                    </p>
                    <p className="text-sm font-light text-anthracite mb-2">{s.hook}</p>
                    <ol className="flex flex-col gap-1 mb-2">
                      {s.shots.map((shot, j) => (
                        <li key={j} className="text-xs font-light text-on-surface-variant">
                          <span className="font-semibold">{j + 1}.</span> {shot.visual}
                          {shot.onScreen ? ` — “${shot.onScreen}”` : ""}
                          {shot.voiceover ? ` · VO: ${shot.voiceover}` : ""}
                        </li>
                      ))}
                    </ol>
                    <p className="text-xs font-light text-anthracite whitespace-pre-line">{s.caption}</p>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] font-light text-on-surface-variant mt-2">
              Scripts to film + upload manually (Reels / TikTok). Pick trending audio yourself.
            </p>
          </div>

          <p className="text-[10px] font-light text-on-surface-variant mt-6">
            galley id <code>{galleyId}</code>
          </p>
        </>
      )}
    </div>
  );
}
