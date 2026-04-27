import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Limits are configurable via env vars — override in Vercel dashboard without a deploy
const PARSE_LIMIT = parseInt(process.env.RATE_LIMIT_PARSE ?? "10", 10);
const PARSE_IMAGE_LIMIT = parseInt(process.env.RATE_LIMIT_PARSE_IMAGE ?? "5", 10);
const RECS_LIMIT = parseInt(process.env.RATE_LIMIT_RECS ?? "20", 10);
const WINDOW = "1 h" as const;

function makeRatelimiter(limit: number) {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  return new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(limit, WINDOW),
    analytics: false,
  });
}

// Lazily created — one instance per cold start per limiter type
let parseLimiter: Ratelimit | null | undefined;
let parseImageLimiter: Ratelimit | null | undefined;
let recsLimiter: Ratelimit | null | undefined;

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

async function check(getLimiter: () => Ratelimit | null, key: string): Promise<RateLimitResult> {
  const limiter = getLimiter();
  if (!limiter) return { allowed: true }; // Upstash not configured — pass through

  const { success, reset } = await limiter.limit(key);
  if (success) return { allowed: true };

  const retryAfterSeconds = Math.ceil((reset - Date.now()) / 1000);
  return { allowed: false, retryAfterSeconds };
}

export function checkParseLimit(userId: string) {
  if (parseLimiter === undefined) parseLimiter = makeRatelimiter(PARSE_LIMIT);
  return check(() => parseLimiter ?? null, `parse:${userId}`);
}

export function checkParseImageLimit(userId: string) {
  if (parseImageLimiter === undefined) parseImageLimiter = makeRatelimiter(PARSE_IMAGE_LIMIT);
  return check(() => parseImageLimiter ?? null, `parse-img:${userId}`);
}

export function checkRecsLimit(userId: string) {
  if (recsLimiter === undefined) recsLimiter = makeRatelimiter(RECS_LIMIT);
  return check(() => recsLimiter ?? null, `recs:${userId}`);
}
