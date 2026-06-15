/**
 * Composite the galleybook logo into the bottom-right corner of an image
 * (GAL-448 — "every pic should have the GB logo in the right bottom corner").
 *
 * Applied to the final rendered marketing images (carousel slides today; reel
 * frames + Facebook photos as those channels land) rather than to the source
 * watercolor, because carousel slides cover-crop the source 1:1 image and would
 * clip a corner watermark. Operating on the finished, fixed-size image
 * guarantees the mark always sits in the corner of the published pic.
 *
 * `public/logo.png` is a black monogram on transparent. On the light watercolor
 * / parchment slides we use it as-is; for dark backgrounds pass
 * `variant: "dark"` to invert it to white (matching the CTA slides).
 */

import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

let blackLogoCache: Buffer | null | undefined;
let whiteLogoCache: Buffer | null | undefined;

async function loadLogo(variant: "light" | "dark"): Promise<Buffer | null> {
  if (variant === "dark") {
    if (whiteLogoCache !== undefined) return whiteLogoCache;
  } else if (blackLogoCache !== undefined) {
    return blackLogoCache;
  }
  try {
    const buf = await readFile(join(process.cwd(), "public", "logo.png"));
    if (variant === "dark") {
      // Invert RGB (black → white), keep alpha — reads on dark backgrounds.
      whiteLogoCache = await sharp(buf).negate({ alpha: false }).png().toBuffer();
      return whiteLogoCache;
    }
    blackLogoCache = buf;
    return blackLogoCache;
  } catch {
    if (variant === "dark") whiteLogoCache = null;
    else blackLogoCache = null;
    return null;
  }
}

export interface OverlayLogoOptions {
  /** "light" (black logo, default) for light bgs; "dark" (white logo) for dark. */
  variant?: "light" | "dark";
  /** Logo width as a fraction of image width. Default 0.09 (~9%). */
  widthFraction?: number;
  /** Safe-area inset from the edges, as a fraction of image width. Default 0.035. */
  insetFraction?: number;
  /** Logo opacity, 0–1. Default 0.85 — reads as a watermark, not a sticker. */
  opacity?: number;
  /** Output JPEG quality. Default 88. */
  quality?: number;
}

/**
 * Return `input` with the logo composited bottom-right. On any failure returns
 * the input untouched — a missing/broken logo must never block publishing.
 */
export async function overlayLogo(
  input: Buffer,
  {
    variant = "light",
    widthFraction = 0.09,
    insetFraction = 0.035,
    opacity = 0.85,
    quality = 88,
  }: OverlayLogoOptions = {},
): Promise<Buffer> {
  const logo = await loadLogo(variant);
  if (!logo) return input;

  try {
    const base = sharp(input);
    const meta = await base.metadata();
    const W = meta.width ?? 1080;
    const H = meta.height ?? 1080;

    const logoW = Math.max(1, Math.round(W * widthFraction));
    const inset = Math.round(W * insetFraction);

    // Resize, then fade the alpha to `opacity`. A 1×1 tiled alpha mask with
    // blend "dest-in" multiplies the logo's existing alpha (so transparent
    // areas stay transparent).
    const sized = await sharp(logo).resize({ width: logoW }).ensureAlpha().toBuffer();
    const faded = await sharp(sized)
      .composite([
        {
          input: Buffer.from([255, 255, 255, Math.round(255 * opacity)]),
          raw: { width: 1, height: 1, channels: 4 },
          tile: true,
          blend: "dest-in",
        },
      ])
      .png()
      .toBuffer();

    const logoMeta = await sharp(faded).metadata();
    const logoH = logoMeta.height ?? logoW;

    return await base
      .composite([
        {
          input: faded,
          left: Math.max(0, W - logoW - inset),
          top: Math.max(0, H - logoH - inset),
        },
      ])
      .jpeg({ quality })
      .toBuffer();
  } catch {
    return input;
  }
}
