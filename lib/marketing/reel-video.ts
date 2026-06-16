/**
 * Simple reel renderer (GAL-452).
 *
 * Turns the carousel slides we already generate (cover → recipes → CTA, so the
 * call-to-action is baked in) into a 9:16 slideshow MP4 with optional
 * background music. Deliberately minimal — static slides, fixed time each, one
 * audio track. No voiceover.
 *
 * Runs `ffmpeg` (the bundled static binary from `ffmpeg-static`) in a serverless
 * function. The binary is force-included in the function bundle via
 * `outputFileTracingIncludes` in next.config.ts.
 */

import sharp from "sharp";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, copyFile, chmod, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

const W = 1080;
const H = 1920;

/**
 * Vercel's file tracer bundles the static ffmpeg binary, but the function
 * filesystem is read-only and the executable bit isn't always preserved. Copy
 * it to /tmp (writable) once per cold start and chmod +x there.
 */
async function ensureFfmpeg(): Promise<string> {
  if (!ffmpegPath) throw new Error("ffmpeg-static binary path unavailable");
  const dest = join(tmpdir(), "gb-ffmpeg");
  try {
    await access(dest, fsConstants.X_OK);
    return dest;
  } catch {
    // not yet copied this cold start
  }
  await copyFile(ffmpegPath, dest);
  await chmod(dest, 0o755);
  return dest;
}

/** Letterbox a slide into 9:16 over a blurred cover of itself (same look as the TikTok proxy). */
async function padTo916(input: Buffer): Promise<Buffer> {
  const [bg, fg] = await Promise.all([
    sharp(input).resize(W, H, { fit: "cover" }).blur(40).modulate({ brightness: 0.9 }).toBuffer(),
    sharp(input).resize(W, H, { fit: "inside" }).toBuffer(),
  ]);
  return sharp(bg)
    .composite([{ input: fg, gravity: "center" }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-800)}`)),
    );
  });
}

export interface RenderReelInput {
  /** Public JPEG URLs of the slides, in order. */
  slideUrls: string[];
  /** Absolute path to a background music file, or null/undefined for silent. */
  audioFile?: string | null;
  /** Seconds each slide is shown. Default 2.5. */
  secondsPerSlide?: number;
}

/** Render the slideshow and return the MP4 bytes. Throws on any ffmpeg failure. */
export async function renderReelVideo({
  slideUrls,
  audioFile,
  secondsPerSlide = 2.5,
}: RenderReelInput): Promise<Buffer> {
  if (slideUrls.length < 1) throw new Error("No slides to render");
  const bin = await ensureFfmpeg();

  const dir = await mkdtemp(join(tmpdir(), "reel-"));
  try {
    // 1) Download + pad each slide to 9:16.
    const frames: string[] = [];
    for (let i = 0; i < slideUrls.length; i++) {
      const res = await fetch(slideUrls[i]);
      if (!res.ok) throw new Error(`slide ${i} fetch failed (${res.status})`);
      const padded = await padTo916(Buffer.from(await res.arrayBuffer()));
      const f = join(dir, `frame-${String(i).padStart(3, "0")}.jpg`);
      await writeFile(f, padded);
      frames.push(f);
    }

    // 2) Concat-demuxer playlist. The demuxer ignores the final entry's
    //    duration, so the last frame is listed twice to get its full time.
    const lines: string[] = [];
    for (const f of frames) {
      lines.push(`file '${f}'`);
      lines.push(`duration ${secondsPerSlide}`);
    }
    lines.push(`file '${frames[frames.length - 1]}'`);
    const listPath = join(dir, "list.txt");
    await writeFile(listPath, lines.join("\n"));

    const out = join(dir, "reel.mp4");
    const totalSeconds = slideUrls.length * secondsPerSlide;

    const args = ["-y", "-f", "concat", "-safe", "0", "-i", listPath];
    if (audioFile) {
      // Loop a short track to fill the video; -t below trims everything to length.
      args.push("-stream_loop", "-1", "-i", audioFile);
    }
    args.push(
      "-vf", "fps=30,format=yuv420p",
      "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
    );
    if (audioFile) {
      args.push("-c:a", "aac", "-b:a", "128k");
    }
    args.push("-t", String(totalSeconds), "-movflags", "+faststart", out);

    await runFfmpeg(bin, args);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
