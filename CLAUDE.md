# Galley Book — Claude Code Instructions

## Project

Mobile-first web app for private family recipe storage. Shared "Galleys" (household libraries), AI recipe import, and AI-powered recommendations. Prototype phase: 1–10 users, 1–3 galleys. Keep architecture simple and cheap — do not over-engineer.

**Domain:** galleybook.com  
**Auth:** Google OAuth via Supabase  
**Hosting:** Vercel  

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 App Router |
| Auth + DB | Supabase (PostgreSQL + RLS + Auth) |
| Storage | Supabase Storage (`recipe-photos` bucket) |
| AI — parsing | Anthropic Claude (`claude-sonnet-4-6`) |
| AI — recommendations | Perplexity (`sonar`) |
| Shopping list | Bring! deeplink API |
| Styling | Tailwind CSS v4 |

## Screens

1. **Library** — shared recipe grid, filter chips, search
2. **Recipe Detail** — photos, ingredients, steps, Bring! button, vote
3. **New Recipe** — link import (AI), photo/camera parse (AI), manual
4. **Recommendations** — AI-curated list from saved sources
5. **Settings** — profile, galley members, recommendation sources, deleted recipes

## File Structure Conventions

```
app/
├── (app)/              # Authenticated pages — server components that fetch data,
│   │                   # pass props to *-client.tsx for interactivity
│   ├── library/page.tsx
│   ├── recipe/[id]/page.tsx
│   ├── new/page.tsx    # "use client" — fully interactive
│   ├── recommendations/page.tsx
│   └── settings/
│       ├── page.tsx          # server: fetches all data
│       └── settings-client.tsx  # client: all state + mutations
├── api/                # Route handlers — always auth-check first
│   ├── recipes/route.ts
│   ├── recipes/[id]/route.ts
│   ├── recipes/[id]/photos/route.ts
│   ├── recipes/parse/route.ts
│   ├── recipes/parse-image/route.ts
│   ├── sources/route.ts
│   ├── sources/[id]/route.ts
│   ├── recommendations/route.ts
│   ├── invites/route.ts
│   ├── galleys/route.ts
│   ├── bring/route.ts
│   └── account/route.ts
├── auth/               # Login + callback
├── share/[token]/      # Public (no auth) — Schema.org for Bring!
components/
├── recipe-card.tsx
├── ui/                 # Base UI primitives
lib/
├── supabase/
│   ├── client.ts       # createClient() for "use client" components
│   └── server.ts       # createClient() for server components / route handlers
types/
└── database.ts         # Hand-maintained — keep in sync with schema
```

## API Route Pattern

Every route handler follows this exact structure:

```ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ... logic

  return NextResponse.json({ ... }, { status: 201 });
}
```

- Always `await createClient()` (server-side, async)
- Auth check is always the first thing after creating the client
- Return `NextResponse.json(...)` with explicit status codes
- No try/catch wrapping the entire handler — handle specific errors inline

## Server Component Pattern (authenticated pages)

```tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";

export default async function SomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // fetch data with Promise.all for parallel queries
  const [{ data: foo }, { data: bar }] = await Promise.all([...]);

  return <SomeClient foo={foo} bar={bar} />;
}
```

- Use `Promise.all` for independent queries — never sequential awaits
- Pass all data as props to the `*-client.tsx` component
- `export const dynamic = "force-dynamic"` on pages with user-specific data

## Supabase Patterns

```ts
// User's galley (always use the earliest membership)
const { data: membership } = await supabase
  .from("galley_members")
  .select("galley_id")
  .eq("user_id", user.id)
  .order("invited_at", { ascending: true })
  .limit(1)
  .single();
```

- RLS is enabled — the server-side client uses the user's session automatically
- `deleted_at` soft-deletes on recipes: always filter `.is("deleted_at", null)` in queries
- Recipes are scoped to `galley_id`, not `user_id`

## Data Types

```ts
type SourceType = "instagram" | "youtube" | "tiktok" | "website"  // tiktok added via ALTER TYPE migration
type RecipeType = "starter" | "main" | "dessert" | "breakfast" | "snack" | "drink" | "side"
type RecipeSeason = "spring" | "summer" | "autumn" | "winter" | "all_year"
```

---

## Design System — "The Culinary Gallery"

Editorial, gallery-like, minimalist flat. Font: **Inter exclusively**.

### Colors

| Token | Value | Use |
|---|---|---|
| Background | `#FFFFFF` | Page background |
| Anthracite / Primary text | `#252729` | Headings, buttons |
| Body text | `#474747` | Body copy (never pure black) |
| Surface base | `#F9F9F9` | — |
| Surface low | `#F3F3F4` | Cards, containers |
| Surface lowest | `#FFFFFF` | Inputs, elevated cards |
| Input bg | `#E2E2E2` | — |

In Tailwind: `text-anthracite`, `bg-surface-low`, `bg-surface-lowest`, `bg-surface-highest`, `text-on-surface-variant`, `shadow-ambient`.

### Typography

| Role | Size | Weight | Use |
|---|---|---|---|
| Display-LG | `text-4xl` / 3.5rem | `font-thin` (100) | Recipe titles, page headers |
| Headline-MD | 1.75rem | `font-light` (300) | Section headers |
| Title-SM | `text-sm` / 1rem | `font-semibold` (600) | Metadata labels |
| Body-MD | `text-sm` / 0.875rem | `font-light` (300) | Body copy, inputs |
| Labels | `text-xs` | `font-semibold` + `uppercase tracking-widest` | Section headers in settings/forms |

### Buttons

```tsx
// Primary
<button className="bg-anthracite text-white text-sm font-light py-3 rounded-full">

// Primary (inline style when Tailwind conflicts)
style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#fff" }}
className="border text-sm font-light py-3 rounded-full"

// Ghost / Secondary
style={{ backgroundColor: "#fff", color: "#252729", borderColor: "#252729" }}
className="border text-sm font-light py-3 rounded-full"

// Destructive
className="bg-red-500 text-white text-sm font-light py-3 rounded-full"
```

- Border radius is always `rounded-full` for buttons, `rounded-md` for containers
- Disabled state: always `disabled:opacity-40`
- Loading state: show text like "Saving…" / "Adding…", never a spinner component

### Inputs

```tsx
className="w-full bg-white border border-[#252729] rounded-full px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 outline-none"
```

### Cards / Containers

```tsx
className="bg-surface-lowest rounded-md px-4 py-3 shadow-ambient"
```

### HARD RULES — Never Violate

- **NO** `border` / `divide-*` / `border-b` for visual sectioning — use spacing or tonal bg shifts
- **NO** divider lines between list items
- **NO** `rounded-none` or `rounded-sm` on interactive elements — use `rounded-full` (buttons) or `rounded-md` (cards)
- **NO** pure `#000000` or `text-black` for body text — use `text-anthracite` (`#252729`) or `#474747`
- **NO** bold/heavy weights for body copy — `font-light` is the default
- Floating CTAs over images: glassmorphism — `bg-black/40 backdrop-blur-sm rounded-full`
- Shadows: ambient only — `shadow-ambient` (4% opacity, 40px blur, 12px Y-offset)

---

## AI Integration

### Recipe parsing (Anthropic)
- Endpoint: `POST /api/recipes/parse` (URL) and `POST /api/recipes/parse-image` (photo)
- Model: `claude-sonnet-4-6`
- Returns `RecipeForm` shape — user reviews before saving

### Recommendations (Perplexity)
- Endpoint: `GET /api/recommendations`
- Uses saved sources from `saved_sources` table
- Deduplicates against `discover_memory` table

### Auto-source from link import
When a recipe is saved with a `source_url`, `extractSource()` in `api/recipes/route.ts` detects the platform (Instagram, YouTube, TikTok, website) and upserts a row into `saved_sources` automatically.

---

## What NOT to Do

- Do not add error handling for impossible scenarios
- Do not add features beyond what was asked
- Do not create utility helpers for one-off operations
- Do not add docstrings or comments to unchanged code
- Do not use `console.log` in production code
- Do not add optimistic UI patterns — a loading state (disabled button + "…" text) is sufficient
- Do not use `any` types — use the types in `types/database.ts`
