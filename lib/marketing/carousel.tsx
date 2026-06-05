/**
 * IG carousel slide renderer (GAL-390).
 *
 * Renders 1080×1350 (4:5) slides for a published galley:
 *   cover → 3 recipes → CTA → remaining recipes → CTA.
 * Both CTA slides carry the galleybook logo.
 *
 * Pipeline: JSX → PNG via next/og `ImageResponse` (Satori+Resvg, flexbox-only
 * CSS) → JPEG via sharp. IG requires JPEG; sharp also pre-shrinks embedded
 * photos so each slide stays under the 500KB ImageResponse bundle limit.
 *
 * Returns JPEG Buffers; the caller uploads them to public storage and hands
 * the public URLs to `postCarouselToInstagram`.
 */

import { ImageResponse } from "next/og";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ASPECT_DIMENSIONS } from "./watercolor-style";

const { width: W, height: H } = ASPECT_DIMENSIONS["4:5"]; // 1080 × 1350

const ANTHRACITE = "#252729";
const BODY = "#474747";
const PARCHMENT = "#F9F9F9";

// ---- Fonts (memoized) ------------------------------------------------------

let fontCache: { name: string; data: ArrayBuffer; weight: 300 | 600; style: "normal" }[] | null =
  null;

async function loadFonts() {
  if (fontCache) return fontCache;
  const dir = join(process.cwd(), "assets", "fonts");
  const [light, semibold] = await Promise.all([
    readFile(join(dir, "Inter-Light.ttf")),
    readFile(join(dir, "Inter-SemiBold.ttf")),
  ]);
  // Slice to the exact byte range — Node pools Buffers, so `.buffer` alone can
  // hand Satori a larger backing store and corrupt font parsing.
  const toArrayBuffer = (b: Buffer): ArrayBuffer =>
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  fontCache = [
    { name: "Inter", data: toArrayBuffer(light), weight: 300, style: "normal" },
    { name: "Inter", data: toArrayBuffer(semibold), weight: 600, style: "normal" },
  ];
  return fontCache;
}

// ---- Logo (memoized) -------------------------------------------------------

let logoCache: string | null | undefined;

/**
 * The CTA slides sit on a dark anthracite background, but `public/logo.png` is
 * a black monogram on transparent. Invert the RGB (black → white) while keeping
 * the alpha channel so the mark reads cleanly on dark. Returns a PNG data URI.
 */
async function loadLogoDataUri(): Promise<string | null> {
  if (logoCache !== undefined) return logoCache;
  try {
    const buf = await readFile(join(process.cwd(), "public", "logo.png"));
    const white = await sharp(buf).negate({ alpha: false }).png().toBuffer();
    logoCache = `data:image/png;base64,${white.toString("base64")}`;
  } catch {
    logoCache = null;
  }
  return logoCache;
}

// ---- Image pre-processing --------------------------------------------------

/**
 * Fetch a recipe image and downscale+compress to a JPEG data URI so embedding
 * it in ImageResponse stays well under the 500KB bundle cap.
 */
async function toEmbeddedDataUri(
  imageUrl: string,
  box: { width: number; height: number },
): Promise<string | null> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());
    const jpeg = await sharp(input)
      .resize(box.width, box.height, { fit: "cover", position: "centre" })
      .jpeg({ quality: 78 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

async function renderToJpeg(
  element: React.ReactElement,
  fonts: Awaited<ReturnType<typeof loadFonts>>,
): Promise<Buffer> {
  const resp = new ImageResponse(element, { width: W, height: H, fonts });
  const png = Buffer.from(await resp.arrayBuffer());
  return sharp(png).jpeg({ quality: 88 }).toBuffer();
}

// ---- Slide templates -------------------------------------------------------

function CoverSlide({ title, heroUri }: { title: string; heroUri: string | null }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: PARCHMENT,
      }}
    >
      <div style={{ display: "flex", flex: 1, position: "relative" }}>
        {heroUri ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroUri} width={W} height={H * 0.62} alt="" style={{ objectFit: "cover" }} />
        ) : (
          <div style={{ display: "flex", width: "100%", backgroundColor: "#EDE7DF" }} />
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", padding: "56px 64px 72px" }}>
        <div
          style={{
            display: "flex",
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: BODY,
            marginBottom: 16,
          }}
        >
          Galley of the Week
        </div>
        <div style={{ display: "flex", fontSize: 76, fontWeight: 300, color: ANTHRACITE, lineHeight: 1.05 }}>
          {title}
        </div>
      </div>
    </div>
  );
}

function RecipeSlide({
  name,
  oneLiner,
  imageUri,
  index,
  total,
}: {
  name: string;
  oneLiner: string;
  imageUri: string | null;
  index: number;
  total: number;
}) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", backgroundColor: "#FFFFFF" }}>
      <div style={{ display: "flex", width: "100%", height: H * 0.68 }}>
        {imageUri ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUri} width={W} height={H * 0.68} alt="" style={{ objectFit: "cover" }} />
        ) : (
          <div style={{ display: "flex", width: "100%", backgroundColor: "#EDE7DF" }} />
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", padding: "44px 64px", flex: 1 }}>
        <div style={{ display: "flex", fontSize: 24, fontWeight: 600, letterSpacing: 4, color: BODY, marginBottom: 14 }}>
          {String(index).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </div>
        <div style={{ display: "flex", fontSize: 56, fontWeight: 600, color: ANTHRACITE, lineHeight: 1.08, marginBottom: 16 }}>
          {name}
        </div>
        <div style={{ display: "flex", fontSize: 32, fontWeight: 300, color: BODY, lineHeight: 1.3 }}>
          {oneLiner}
        </div>
      </div>
    </div>
  );
}

const CTA_COPY = {
  de: {
    midTitle: "Weiter wischen ↓",
    midSub: "Die ganze Galley kommt gleich.",
    endTitle: "Sichere dir die ganze Galley",
    endSub: "Rezepte von Instagram, YouTube & dem Web — in Sekunden, an einem Ort.",
  },
  en: {
    midTitle: "Keep scrolling ↓",
    midSub: "The full galley is just ahead.",
    endTitle: "Save the whole galley",
    endSub: "Recipes from Instagram, YouTube & the web — in seconds, in one place.",
  },
} as const;

function CtaSlide({
  logoUri,
  variant,
  locale = "de",
}: {
  logoUri: string | null;
  variant: "mid" | "end";
  locale?: "de" | "en";
}) {
  const isMid = variant === "mid";
  const copy = CTA_COPY[locale];
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: ANTHRACITE,
        padding: "0 80px",
      }}
    >
      {logoUri ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUri} width={150} height={120} alt="" style={{ objectFit: "contain", marginBottom: 56 }} />
      ) : null}
      <div style={{ display: "flex", fontSize: 72, fontWeight: 300, color: "#FFFFFF", textAlign: "center", lineHeight: 1.1, marginBottom: 28 }}>
        {isMid ? copy.midTitle : copy.endTitle}
      </div>
      <div style={{ display: "flex", fontSize: 34, fontWeight: 300, color: "#C9C9C9", textAlign: "center", lineHeight: 1.35, marginBottom: isMid ? 0 : 56 }}>
        {isMid ? copy.midSub : copy.endSub}
      </div>
      {isMid ? null : (
        <div style={{ display: "flex", fontSize: 30, fontWeight: 600, color: "#FFFFFF", letterSpacing: 2 }}>
          galleybook.com
        </div>
      )}
    </div>
  );
}

// ---- Public API ------------------------------------------------------------

export interface CarouselRecipe {
  name: string;
  oneLiner: string;
  /** Public URL of the recipe's watercolor image */
  imageUrl: string;
}

export interface RenderCarouselInput {
  /** The marketing post title shown on the cover slide. */
  title: string;
  recipes: CarouselRecipe[];
  /** Language for the CTA slide copy. Defaults to "de" (Germany-first). */
  locale?: "de" | "en";
}

/** Insert a mid-carousel CTA after this many recipe slides. */
const MID_CTA_AFTER = 3;

/**
 * Render cover + per-recipe + CTA slides. Returns JPEG buffers in display order.
 * A CTA slide is inserted after the 3rd recipe and another at the end; both
 * carry the logo. Caps at 7 recipe slides so the carousel stays within IG's
 * 10-item limit (cover + 7 recipes + 2 CTAs = 10).
 */
export async function renderCarousel({
  title,
  recipes,
  locale = "de",
}: RenderCarouselInput): Promise<Buffer[]> {
  const fonts = await loadFonts();
  const logoUri = await loadLogoDataUri();
  const capped = recipes.slice(0, 7);

  const heroUri = capped[0] ? await toEmbeddedDataUri(capped[0].imageUrl, { width: W, height: Math.round(H * 0.62) }) : null;

  const recipeUris = await Promise.all(
    capped.map((r) => toEmbeddedDataUri(r.imageUrl, { width: W, height: Math.round(H * 0.68) })),
  );

  const slides: React.ReactElement[] = [
    <CoverSlide key="cover" title={title} heroUri={heroUri} />,
  ];
  capped.forEach((r, i) => {
    slides.push(
      <RecipeSlide
        key={`recipe-${i}`}
        name={r.name}
        oneLiner={r.oneLiner}
        imageUri={recipeUris[i]}
        index={i + 1}
        total={capped.length}
      />,
    );
    // Mid-carousel CTA after the 3rd recipe — only when more recipes follow,
    // so it never lands right before the closing CTA.
    if (i + 1 === MID_CTA_AFTER && capped.length > MID_CTA_AFTER) {
      slides.push(<CtaSlide key="cta-mid" logoUri={logoUri} variant="mid" locale={locale} />);
    }
  });
  slides.push(<CtaSlide key="cta-end" logoUri={logoUri} variant="end" locale={locale} />);

  // Render sequentially — each ImageResponse is CPU-heavy (Satori + Resvg);
  // parallelizing risks OOM in a serverless function.
  const buffers: Buffer[] = [];
  for (const slide of slides) {
    buffers.push(await renderToJpeg(slide, fonts));
  }
  return buffers;
}
