"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { clsx } from "clsx";

type Mode = "link" | "photo" | "manual";

const SEASONS = ["all_year", "spring", "summer", "autumn", "winter"] as const;
const TYPES = ["starter", "main", "dessert", "breakfast", "snack", "drink", "side"] as const;
const UNITS = ["g", "kg", "ml", "l", "tsp", "tbsp", "cup", "piece", "pinch", "slice", "clove", "handful", "to taste"] as const;

interface Ingredient {
  _key: string;
  name: string;
  amount: string;
  unit: string;
  group: string;
}

interface Step {
  _key: string;
  instruction: string;
}

interface RecipeForm {
  name: string;
  description: string;
  servings: string;
  prep_time: string;
  season: string;
  type: string;
  source_url: string;
  image_url: string;
  ingredients: Ingredient[];
  steps: Step[];
}

const emptyForm: RecipeForm = {
  name: "",
  description: "",
  servings: "4",
  prep_time: "",
  season: "all_year",
  type: "main",
  source_url: "",
  image_url: "",
  ingredients: [{ _key: "ing-init", name: "", amount: "", unit: "g", group: "" }],
  steps: [{ _key: "step-init", instruction: "" }],
};

interface Props {
  galleys: { id: string; name: string; isDefault: boolean }[];
  defaultGalleyId: string;
}

export function NewRecipeClient({ galleys, defaultGalleyId }: Props) {
  const [mode, setMode] = useState<Mode>("link");
  const [linkUrl, setLinkUrl] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [form, setForm] = useState<RecipeForm>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [imageCandidates, setImageCandidates] = useState<string[]>([]);
  const [selectedGalleyId, setSelectedGalleyId] = useState(defaultGalleyId);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const [cameraFiles, setCameraFiles] = useState<File[]>([]);
  const [cameraPreviews, setCameraPreviews] = useState<string[]>([]);
  const [cameraError, setCameraError] = useState("");
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleParseLink() {
    if (!linkUrl.trim()) return;
    setParsing(true);
    setParseError("");
    try {
      const res = await fetch("/api/recipes/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: linkUrl }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to parse recipe");
      }
      const parsed: RecipeForm & { image_url?: string; image_candidates?: string[] } = await res.json();
      setForm({
        ...emptyForm,
        ...parsed,
        ingredients: (parsed.ingredients ?? []).map((ing) => ({ ...ing, _key: crypto.randomUUID(), group: ing.group ?? "" })),
        steps: (parsed.steps ?? []).map((step) => ({ ...step, _key: crypto.randomUUID() })),
        source_url: linkUrl,
      });
      const candidates = parsed.image_candidates ?? (parsed.image_url ? [parsed.image_url] : []);
      setImageCandidates(candidates);
      if (parsed.image_url) setPhotoPreview(parsed.image_url);
      setShowForm(true);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setParsing(false);
    }
  }

  function handleCameraCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCameraFiles((prev) => [...prev, file]);
    setCameraPreviews((prev) => [...prev, URL.createObjectURL(file)]);
    setCameraError("");
    e.target.value = "";
  }

  function removeCameraPhoto(idx: number) {
    setCameraFiles((prev) => prev.filter((_, i) => i !== idx));
    setCameraPreviews((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleParsePhoto() {
    if (cameraFiles.length === 0) return;
    setParsing(true);
    setCameraError("");
    try {
      const fd = new FormData();
      for (const file of cameraFiles) fd.append("photo", file);
      const res = await fetch("/api/recipes/parse-image", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Could not read recipe from photo");
      }
      const parsed: RecipeForm = await res.json();
      setPhotoFile(cameraFiles[0]);
      setPhotoPreview(cameraPreviews[0]);
      setForm({
        ...emptyForm,
        ...parsed,
        ingredients: (parsed.ingredients ?? []).map((ing) => ({ ...ing, _key: crypto.randomUUID() })),
        steps: (parsed.steps ?? []).map((step) => ({ ...step, _key: crypto.randomUUID() })),
      });
      setShowForm(true);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setParsing(false);
    }
  }

  function clearCamera() {
    setCameraFiles([]);
    setCameraPreviews([]);
    setCameraError("");
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setImageCandidates([]);
    setForm((prev) => ({ ...prev, image_url: "" }));
  }

  function clearPhoto() {
    setPhotoFile(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
    if (imageCandidates.length > 0) {
      setPhotoPreview(imageCandidates[0]);
      setForm((prev) => ({ ...prev, image_url: imageCandidates[0] }));
    } else {
      setPhotoPreview("");
      setForm((prev) => ({ ...prev, image_url: "" }));
    }
  }

  function updateField<K extends keyof RecipeForm>(key: K, value: RecipeForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateIngredient(idx: number, field: keyof Ingredient, value: string) {
    setForm((prev) => {
      const ingredients = [...prev.ingredients];
      ingredients[idx] = { ...ingredients[idx], [field]: value };
      return { ...prev, ingredients };
    });
  }

  function addIngredient() {
    setForm((prev) => ({
      ...prev,
      ingredients: [...prev.ingredients, { _key: crypto.randomUUID(), name: "", amount: "", unit: "g", group: "" }],
    }));
  }

  function removeIngredient(idx: number) {
    setForm((prev) => ({ ...prev, ingredients: prev.ingredients.filter((_, i) => i !== idx) }));
  }

  function updateStep(idx: number, value: string) {
    setForm((prev) => {
      const steps = [...prev.steps];
      steps[idx] = { ...steps[idx], instruction: value };
      return { ...prev, steps };
    });
  }

  function addStep() {
    setForm((prev) => ({
      ...prev,
      steps: [...prev.steps, { _key: crypto.randomUUID(), instruction: "" }],
    }));
  }

  function removeStep(idx: number) {
    setForm((prev) => ({ ...prev, steps: prev.steps.filter((_, i) => i !== idx) }));
  }

  async function handleSave() {
    if (!form.name.trim() || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, galleyId: selectedGalleyId }),
      });
      if (!res.ok) throw new Error("Failed to save recipe");
      const { id } = await res.json();
      if (photoFile) {
        const fd = new FormData();
        fd.append("photo", photoFile);
        await fetch(`/api/recipes/${id}/photos`, { method: "POST", body: fd });
      }
      router.push(`/recipe/${id}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="px-5 pt-12 pb-8">
      <h1 className="text-4xl font-thin text-anthracite mb-1">Add New Recipe</h1>
      <p className="text-sm font-light text-on-surface-variant mb-6">
        Import a link, scan a photo, or add manually.
      </p>

      {/* Galley picker — only when user belongs to 2+ galleys */}
      {galleys.length > 1 && (
        <div className="mb-6">
          <label className="text-xs font-semibold text-anthracite uppercase tracking-wide block mb-2">
            Add to
          </label>
          <div className="flex gap-2 flex-wrap">
            {galleys.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelectedGalleyId(g.id)}
                style={
                  selectedGalleyId === g.id
                    ? { backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }
                    : { backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }
                }
                className="px-4 py-2 rounded-full text-sm font-light border transition-colors"
              >
                {g.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mode toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => { setMode("link"); setShowForm(false); clearCamera(); setImageCandidates([]); setPhotoPreview(""); setPhotoFile(null); }}
          style={mode === "link" ? { backgroundColor: "#252729", color: "#fff", borderColor: "#252729" } : { backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }}
          className="flex-1 py-2.5 rounded-full text-sm font-light border transition-colors"
        >
          Import Link
        </button>
        <button
          onClick={() => { setMode("photo"); setShowForm(false); }}
          style={mode === "photo" ? { backgroundColor: "#252729", color: "#fff", borderColor: "#252729" } : { backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }}
          className="flex-1 py-2.5 rounded-full text-sm font-light border transition-colors"
        >
          Photo
        </button>
        <button
          onClick={() => { setMode("manual"); setShowForm(true); setForm(emptyForm); setPhotoPreview(""); setPhotoFile(null); setImageCandidates([]); clearCamera(); }}
          style={mode === "manual" ? { backgroundColor: "#252729", color: "#fff", borderColor: "#252729" } : { backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }}
          className="flex-1 py-2.5 rounded-full text-sm font-light border transition-colors"
        >
          Manual
        </button>
      </div>

      {/* Link importer */}
      {mode === "link" && !showForm && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-anthracite uppercase tracking-wide">
            AI Link Importer
          </p>
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="Paste Instagram, YouTube, or web URL…"
            className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 placeholder:font-thin outline-none"
          />
          {parseError && <p className="text-xs font-light text-red-500">{parseError}</p>}
          <p className="text-[11px] font-light text-on-surface-variant">
            Recipe content is sent to Anthropic Claude and Perplexity AI for processing.
          </p>
          <button
            onClick={handleParseLink}
            disabled={!linkUrl.trim()}
            style={{ backgroundColor: "#dc2626", borderColor: "#dc2626", color: "#fff" }}
            className="relative w-full text-sm font-light py-4 rounded-full border overflow-hidden disabled:opacity-40"
          >
            {parsing && (
              <span className="btn-progress-fill absolute inset-y-0 left-0 bg-red-800 rounded-full" />
            )}
            <span className="relative z-10">{parsing ? "Parsing with AI…" : "Parse Recipe"}</span>
          </button>
        </div>
      )}

      {/* Photo / Camera mode */}
      {mode === "photo" && !showForm && (
        <div className="space-y-4">
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCameraCapture} />
          <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handleCameraCapture} />

          {cameraPreviews.length === 0 ? (
            <div className="space-y-3">
              <button
                onClick={() => cameraInputRef.current?.click()}
                style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
                className="w-full border rounded-md py-10 flex flex-col items-center gap-3 transition-opacity"
              >
                <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                  <rect x="2" y="8" width="32" height="22" rx="3" stroke="white" strokeWidth="1.8"/>
                  <circle cx="18" cy="19" r="6" stroke="white" strokeWidth="1.8"/>
                  <circle cx="18" cy="19" r="2.5" fill="white"/>
                  <path d="M12 8l2-4h8l2 4" stroke="white" strokeWidth="1.8" strokeLinejoin="round"/>
                </svg>
                <span className="text-sm font-light">Take Photo</span>
              </button>
              <button
                onClick={() => galleryInputRef.current?.click()}
                className="w-full border border-anthracite bg-white text-anthracite rounded-md py-4 flex items-center justify-center gap-2 text-sm font-light transition-opacity"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <rect x="1" y="1" width="16" height="16" rx="2" stroke="#252729" strokeWidth="1.3"/>
                  <path d="M1 12l4-4 3 3 3-4 6 7H1z" stroke="#252729" strokeWidth="1.3" strokeLinejoin="round"/>
                  <circle cx="5.5" cy="5.5" r="1.5" stroke="#252729" strokeWidth="1.3"/>
                </svg>
                Choose from Library
              </button>
              <p className="text-xs font-light text-on-surface-variant text-center pt-1">
                Point your camera at a cookbook page, printed recipe, or handwritten card
              </p>
            </div>
          ) : cameraPreviews.length === 1 ? (
            <div className="space-y-4">
              <div className="relative w-full aspect-[4/3] rounded-md overflow-hidden bg-surface-low">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cameraPreviews[0]} alt="Captured recipe" className="w-full h-full object-cover" />
                <button
                  onClick={() => removeCameraPhoto(0)}
                  className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center bg-black/40 rounded-full backdrop-blur-sm"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 2l8 8M10 2l-8 8" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex-1 border border-anthracite bg-white text-anthracite rounded-full py-2.5 text-sm font-light flex items-center justify-center gap-1.5"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 3v8M3 7h8" stroke="#252729" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  Take another
                </button>
                <button
                  onClick={() => galleryInputRef.current?.click()}
                  className="flex-1 border border-anthracite bg-white text-anthracite rounded-full py-2.5 text-sm font-light flex items-center justify-center gap-1.5"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 3v8M3 7h8" stroke="#252729" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  Add from library
                </button>
              </div>
              {cameraError && <p className="text-xs font-light text-red-500">{cameraError}</p>}
              <p className="text-[11px] font-light text-on-surface-variant">
                Your photo is sent to Google Gemini for processing. Add more pages if the recipe spans multiple images.
              </p>
              <button
                onClick={handleParsePhoto}
                disabled={parsing}
                style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
                className="w-full border text-sm font-light py-4 rounded-full transition-opacity disabled:opacity-40"
              >
                {parsing ? "Reading recipe with AI…" : "Parse Recipe from Photo"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-5 px-5 snap-x snap-mandatory">
                {cameraPreviews.map((preview, i) => (
                  <div key={i} className="relative flex-shrink-0 w-28 aspect-square snap-start rounded-md overflow-hidden bg-surface-low">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview} alt={`Page ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeCameraPhoto(i)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center bg-black/50 rounded-full backdrop-blur-sm"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
                      </svg>
                    </button>
                    <span className="absolute bottom-1.5 left-1.5 text-[9px] font-semibold text-white bg-black/50 px-1.5 py-0.5 rounded-full">
                      {i + 1}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex-1 border border-anthracite bg-white text-anthracite rounded-full py-2.5 text-sm font-light flex items-center justify-center gap-1.5"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 3v8M3 7h8" stroke="#252729" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  Take another
                </button>
                <button
                  onClick={() => galleryInputRef.current?.click()}
                  className="flex-1 border border-anthracite bg-white text-anthracite rounded-full py-2.5 text-sm font-light flex items-center justify-center gap-1.5"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 3v8M3 7h8" stroke="#252729" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  Add from library
                </button>
              </div>
              {cameraError && <p className="text-xs font-light text-red-500">{cameraError}</p>}
              <p className="text-[11px] font-light text-on-surface-variant">
                {cameraPreviews.length} pages selected. Your photos are sent to Google Gemini for processing.
              </p>
              <button
                onClick={handleParsePhoto}
                disabled={parsing}
                style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
                className="w-full border text-sm font-light py-4 rounded-full transition-opacity disabled:opacity-40"
              >
                {parsing ? "Reading recipe with AI…" : `Parse Recipe from ${cameraPreviews.length} Photos`}
              </button>
              <button
                onClick={clearCamera}
                className="w-full border border-anthracite bg-white text-anthracite text-sm font-light py-3 rounded-full transition-opacity"
              >
                Start Over
              </button>
            </div>
          )}
        </div>
      )}

      {/* Recipe form (manual or post-parse) */}
      {showForm && (
        <div className="space-y-6">
          {(mode === "link" || mode === "photo") && (
            <div className="bg-surface-low rounded-md px-4 py-3">
              <p className="text-xs font-light text-on-surface-variant">
                AI parsed the recipe below. Review and edit before saving.
              </p>
            </div>
          )}

          {/* Photo upload */}
          <div>
            <label className="text-xs font-semibold text-anthracite uppercase tracking-wide block mb-1.5">Photo</label>
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />

            {photoFile ? (
              <div className="relative w-full aspect-[3/2] rounded-md overflow-hidden bg-surface-low">
                <Image src={photoPreview} alt="Recipe photo" fill className="object-cover" unoptimized />
                <div className="absolute inset-0 flex items-end justify-between p-3">
                  <button type="button" onClick={() => photoInputRef.current?.click()} className="text-xs font-light text-white bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-sm">Change</button>
                  <button type="button" onClick={clearPhoto} className="w-7 h-7 flex items-center justify-center bg-black/40 rounded-full backdrop-blur-sm">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </button>
                </div>
              </div>
            ) : imageCandidates.length > 1 ? (
              <div>
                <div className="flex gap-2 overflow-x-auto pb-2 -mx-5 px-5 snap-x snap-mandatory">
                  {imageCandidates.map((candidateUrl, i) => (
                    <button key={i} type="button" onClick={() => { setPhotoPreview(candidateUrl); setForm((prev) => ({ ...prev, image_url: candidateUrl })); }}
                      className={clsx("flex-shrink-0 w-28 aspect-square snap-start rounded-md overflow-hidden transition-all", photoPreview === candidateUrl ? "ring-2 ring-anthracite ring-offset-1" : "opacity-50")}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={candidateUrl} alt={`Photo option ${i + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <button type="button" onClick={() => photoInputRef.current?.click()} className="text-xs font-light text-on-surface-variant">Use my own photo</button>
                  {photoPreview && (
                    <button type="button" onClick={() => { setPhotoPreview(""); setForm((prev) => ({ ...prev, image_url: "" })); }} className="text-xs font-light text-on-surface-variant">No photo</button>
                  )}
                </div>
              </div>
            ) : photoPreview ? (
              <div className="relative w-full aspect-[3/2] rounded-md overflow-hidden bg-surface-low">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoPreview} alt="Recipe photo" className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-end justify-between p-3">
                  <button type="button" onClick={() => photoInputRef.current?.click()} className="text-xs font-light text-white bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-sm">Change</button>
                  <button type="button" onClick={clearPhoto} className="w-7 h-7 flex items-center justify-center bg-black/40 rounded-full backdrop-blur-sm">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => photoInputRef.current?.click()} className="w-full aspect-[3/2] rounded-md border border-anthracite/20 flex flex-col items-center justify-center gap-2 bg-surface-low">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <path d="M4 20l6-6 4 4 4-5 6 7H4z" stroke="#C6C6C6" strokeWidth="1.5" strokeLinejoin="round"/>
                  <circle cx="9" cy="10" r="2.5" stroke="#C6C6C6" strokeWidth="1.5"/>
                  <rect x="2" y="5" width="24" height="18" rx="2" stroke="#C6C6C6" strokeWidth="1.5"/>
                </svg>
                <span className="text-xs font-light text-on-surface-variant">Add Photo</span>
              </button>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="text-xs font-semibold text-anthracite uppercase tracking-wide block mb-1.5">Recipe Name *</label>
            <input value={form.name} onChange={(e) => updateField("name", e.target.value)} placeholder="e.g. Heirloom Tomato & Burrata Salad"
              className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none focus-visible:ring-2 focus-visible:ring-anthracite focus-visible:ring-offset-2" />
          </div>

          {/* Servings + Prep time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-anthracite uppercase tracking-wide block mb-1.5">Servings</label>
              <input type="number" min="1" value={form.servings} onChange={(e) => updateField("servings", e.target.value)}
                className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite outline-none focus-visible:ring-2 focus-visible:ring-anthracite focus-visible:ring-offset-2" />
            </div>
            <div>
              <label className="text-xs font-semibold text-anthracite uppercase tracking-wide block mb-1.5">Prep (min)</label>
              <input type="number" min="1" value={form.prep_time} onChange={(e) => updateField("prep_time", e.target.value)} placeholder="30"
                className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none focus-visible:ring-2 focus-visible:ring-anthracite focus-visible:ring-offset-2" />
            </div>
          </div>

          {/* Season + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-anthracite uppercase tracking-wide block mb-1.5">Season</label>
              <select value={form.season} onChange={(e) => updateField("season", e.target.value)}
                className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite outline-none focus-visible:ring-2 focus-visible:ring-anthracite focus-visible:ring-offset-2">
                {SEASONS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-anthracite uppercase tracking-wide block mb-1.5">Type</label>
              <select value={form.type} onChange={(e) => updateField("type", e.target.value)}
                className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite outline-none focus-visible:ring-2 focus-visible:ring-anthracite focus-visible:ring-offset-2">
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Source URL */}
          <div>
            <label className="text-xs font-semibold text-anthracite uppercase tracking-wide block mb-1.5">Source Link</label>
            <input type="url" value={form.source_url} onChange={(e) => updateField("source_url", e.target.value)} placeholder="https://…"
              className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none focus-visible:ring-2 focus-visible:ring-anthracite focus-visible:ring-offset-2" />
          </div>

          {/* Ingredients */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-anthracite uppercase tracking-wide">Ingredients</label>
              <button onClick={addIngredient} className="text-xs font-light border border-anthracite bg-white text-anthracite px-3 py-1 rounded-full">+ Add</button>
            </div>
            <div className="space-y-2">
              {form.ingredients.map((ing, idx) => {
                const prevGroup = idx > 0 ? form.ingredients[idx - 1].group : undefined;
                const showGroupHeader = !!ing.group && ing.group !== prevGroup;
                return (
                  <div key={ing._key}>
                    {showGroupHeader && (
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-3 mb-1.5">{ing.group}</p>
                    )}
                    <div className="flex gap-2 items-center">
                      <input value={ing.name} onChange={(e) => updateIngredient(idx, "name", e.target.value)} placeholder="Ingredient"
                        className="flex-1 bg-white border border-[#252729] rounded-full px-3 py-2.5 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none focus-visible:ring-2 focus-visible:ring-anthracite focus-visible:ring-offset-2" />
                      <input type="number" value={ing.amount} onChange={(e) => updateIngredient(idx, "amount", e.target.value)} placeholder="Amt"
                        className="w-16 bg-white border border-[#252729] rounded-full px-3 py-2.5 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none focus-visible:ring-2 focus-visible:ring-anthracite focus-visible:ring-offset-2" />
                      <select value={ing.unit} onChange={(e) => updateIngredient(idx, "unit", e.target.value)}
                        className="w-20 bg-white border border-[#252729] rounded-full px-2 py-2.5 text-xs font-light text-anthracite outline-none focus-visible:ring-2 focus-visible:ring-anthracite focus-visible:ring-offset-2">
                        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                      {form.ingredients.length > 1 && (
                        <button onClick={() => removeIngredient(idx)} aria-label="Remove ingredient" className="p-3 -m-3 text-on-surface-variant/50 flex-shrink-0">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 8h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Steps */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-anthracite uppercase tracking-wide">Preparation Steps</label>
              <button onClick={addStep} className="text-xs font-light border border-anthracite bg-white text-anthracite px-3 py-1 rounded-full">+ Add</button>
            </div>
            <div className="space-y-3">
              {form.steps.map((step, idx) => (
                <div key={step._key} className="flex gap-3 items-start">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-surface-highest flex items-center justify-center mt-2.5">
                    <span className="text-[9px] font-semibold text-anthracite">{idx + 1}</span>
                  </div>
                  <textarea value={step.instruction} onChange={(e) => updateStep(idx, e.target.value)} placeholder="Describe this step…" rows={2}
                    className="flex-1 bg-white border border-[#252729] rounded-xl px-3 py-2.5 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none resize-none focus-visible:ring-2 focus-visible:ring-anthracite focus-visible:ring-offset-2" />
                  {form.steps.length > 1 && (
                    <button onClick={() => removeStep(idx)} aria-label="Remove step" className="p-3 -m-3 text-on-surface-variant/50 mt-2.5">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 8h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {saveError && <p className="text-xs font-light text-red-500">{saveError}</p>}
          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim()}
            style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
            className="w-full border text-sm font-light py-4 rounded-full transition-opacity disabled:opacity-40 mt-4"
          >
            {saving ? "Saving…" : `Save to ${galleys.find((g) => g.id === selectedGalleyId)?.name ?? "Galley"}`}
          </button>
        </div>
      )}
    </div>
  );
}
