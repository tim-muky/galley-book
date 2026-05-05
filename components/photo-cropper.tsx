"use client";

import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

interface PhotoCropperProps {
  /** Source image — object URL, blob URL, or remote URL with CORS access. */
  src: string;
  /** Suggested filename for the resulting File. */
  filename?: string;
  onConfirm: (file: File, previewUrl: string) => void;
  onCancel: () => void;
}

const ASPECT = 3 / 2;
const OUTPUT_MAX_WIDTH = 1600;

export function PhotoCropper({ src, filename = "recipe.jpg", onConfirm, onCancel }: PhotoCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  // Lock background scroll while the modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function handleConfirm() {
    if (!croppedAreaPixels || busy) return;
    setBusy(true);
    try {
      const { file, previewUrl } = await renderCrop(src, croppedAreaPixels, filename);
      onConfirm(file, previewUrl);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col">
      <div className="relative flex-1">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          aspect={ASPECT}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          objectFit="contain"
          showGrid={false}
        />
      </div>
      <div className="bg-black px-5 pt-4 pb-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-xs font-light text-white/70 w-10">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-white"
            aria-label="Zoom"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 border border-white/60 bg-transparent text-white text-sm font-light py-3 rounded-full disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy || !croppedAreaPixels}
            className="flex-1 bg-white text-anthracite text-sm font-light py-3 rounded-full disabled:opacity-40"
          >
            {busy ? "Cropping…" : "Use photo"}
          </button>
        </div>
      </div>
    </div>
  );
}

async function renderCrop(
  src: string,
  area: Area,
  filename: string
): Promise<{ file: File; previewUrl: string }> {
  const img = await loadImage(src);
  const scale = area.width > OUTPUT_MAX_WIDTH ? OUTPUT_MAX_WIDTH / area.width : 1;
  const outW = Math.round(area.width * scale);
  const outH = Math.round(area.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, outW, outH);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
      "image/jpeg",
      0.9
    );
  });
  const file = new File([blob], filename.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  const previewUrl = URL.createObjectURL(blob);
  return { file, previewUrl };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for crop"));
    img.src = src;
  });
}
