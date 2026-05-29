"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Database } from "@/types/database";
import type { AdVariant } from "@/lib/marketing/ad-copy";

type Distribution = Database["public"]["Tables"]["galley_distributions"]["Row"];

function publicUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/recipe-photos/${path}`;
}

export function DistributeClient({
  runId,
  galleyId,
  galleyName,
  initialDistribution,
}: {
  runId: string;
  galleyId: string;
  galleyName: string;
  initialDistribution: Distribution | null;
}) {
  const [dist, setDist] = useState<Distribution | null>(initialDistribution);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postTitle, setPostTitle] = useState(initialDistribution?.post_title ?? "");
  const [captionDe, setCaptionDe] = useState(initialDistribution?.caption_de ?? "");
  const [captionEn, setCaptionEn] = useState(initialDistribution?.caption_en ?? "");
  const [postLocale, setPostLocale] = useState<"de" | "en">("de");

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

          {/* Instagram post */}
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

          {/* Ad creative variants (Meta push lands with GAL-391) */}
          {adVariants.length > 0 && (
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

          <p className="text-[10px] font-light text-on-surface-variant mt-6">
            galley id <code>{galleyId}</code>
          </p>
        </>
      )}
    </div>
  );
}
