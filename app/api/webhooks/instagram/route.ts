import { createHmac, timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import { META } from "@/lib/marketing/meta-config";
import { sendCommentPrivateReply } from "@/lib/marketing/instagram";
import { NextResponse } from "next/server";

// Signature verification needs the raw body + node crypto; keep this off the
// edge runtime. A couple of Graph calls per comment fit well inside this.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Trigger words the caption asks viewers to comment (both locales — the DM the
// commenter gets is chosen by the posted caption's language, not the word they
// typed). Matched as a whole word, case-insensitive.
const TRIGGERS = ["REZEPT", "RECIPE"];

interface CommentValue {
  id?: string;
  text?: string;
  media?: { id?: string };
  from?: { id?: string; username?: string };
}

interface WebhookBody {
  object?: string;
  entry?: { id?: string; time?: number; changes?: { field?: string; value?: CommentValue }[] }[];
}

/** Constant-time compare of the X-Hub-Signature-256 header against the body HMAC. */
function verifySignature(raw: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** True if the comment text contains one of the trigger words as a whole word. */
function matchesTrigger(text: string): boolean {
  const upper = text.toUpperCase();
  return TRIGGERS.some((t) => new RegExp(`\\b${t}\\b`).test(upper));
}

// ---- Verification handshake (Meta calls this once when you add the callback) ---

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && verifyToken && token === verifyToken && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// ---- Comment events -------------------------------------------------------

export async function POST(request: Request) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    logger.error("webhook.ig.no_app_secret");
    // 200 so Meta doesn't retry a misconfiguration forever.
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), secret)) {
    logger.warn("webhook.ig.bad_signature");
    return new Response("Forbidden", { status: 403 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  if (body.object !== "instagram") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Process best-effort; always ack 200 so Meta doesn't retry (our comment_id
  // primary key makes re-delivery idempotent anyway).
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments" || !change.value) continue;
      await handleComment(change.value).catch((err) => {
        logger.error("webhook.ig.comment_failed", { message: String(err) });
      });
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleComment(value: CommentValue): Promise<void> {
  const commentId = value.id;
  const mediaId = value.media?.id;
  const text = value.text ?? "";
  if (!commentId || !mediaId || !text) return;

  // Never DM our own comments (loop guard).
  if (value.from?.id && value.from.id === META.igUserId) return;

  if (!matchesTrigger(text)) return;

  const service = createServiceClient();

  // Map the media back to the campaign that posted it. Comments on anything we
  // didn't post via Campaign Studio have no distribution row → nothing to send.
  const { data: dist } = await service
    .from("galley_distributions")
    .select("id, galley_id, dm_reply_de, dm_reply_en, ig_posted_locale")
    .eq("ig_post_id", mediaId)
    .maybeSingle();
  if (!dist) return;

  const locale = dist.ig_posted_locale === "en" ? "en" : "de";
  const dmText =
    (locale === "en" ? dist.dm_reply_en : dist.dm_reply_de) ??
    dist.dm_reply_de ??
    dist.dm_reply_en;
  if (!dmText) return;

  // Claim the comment before sending — the primary key rejects a duplicate
  // delivery, so a concurrent redelivery can't double-DM.
  const { error: claimErr } = await service.from("comment_dm_log").insert({
    comment_id: commentId,
    distribution_id: dist.id,
    galley_id: dist.galley_id,
    media_id: mediaId,
    commenter_id: value.from?.id ?? null,
    commenter_username: value.from?.username ?? null,
    locale,
    status: "pending",
  });
  if (claimErr) {
    // 23505 unique_violation → already handled by a prior delivery. Skip.
    return;
  }

  try {
    await sendCommentPrivateReply(commentId, dmText);
    await service
      .from("comment_dm_log")
      .update({ status: "sent" })
      .eq("comment_id", commentId);
    logger.info("webhook.ig.dm_sent", { commentId, galleyId: dist.galley_id, locale });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await service
      .from("comment_dm_log")
      .update({ status: "failed", error: message })
      .eq("comment_id", commentId);
    logger.error("webhook.ig.dm_failed", { commentId, message });
  }
}
