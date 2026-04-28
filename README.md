# Galley Book

A mobile-first web app for private family recipe storage. Share a Galley (library) with your household, import recipes via AI, and send shopping lists directly to Bring!.

**Docs**: [API routes](docs/api.md) · [Runbook](docs/runbook.md) · [CLAUDE.md](CLAUDE.md)

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Auth | Supabase Auth (Google OAuth) |
| Database | Supabase (PostgreSQL + RLS) |
| Storage | Supabase Storage |
| AI – parsing | Anthropic Claude (claude-sonnet-4-6) |
| AI – recommendations | Perplexity (sonar) |
| Shopping list | Bring! deeplink API |
| Hosting | Vercel |

---

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run `supabase/migrations/001_initial_schema.sql`
3. Go to **Storage** → create a bucket named `recipe-photos` (set to **public**)
4. Go to **Authentication** → Providers → enable **Google**
   - Add your Google OAuth client ID & secret (from [Google Cloud Console](https://console.cloud.google.com))
   - Set the redirect URL to: `https://your-project.supabase.co/auth/v1/callback`
5. Copy your **Project URL** and **anon key** from Project Settings → API

### 2. Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Add authorised redirect URI: `https://your-project.supabase.co/auth/v1/callback`
4. Copy the client ID and secret into Supabase Authentication settings

### 3. Environment variables

```bash
cp .env.example .env.local
# Fill in all values
```

### 4. Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Bring! Shopping List Integration

Each recipe has a `share_token` (UUID). When a user taps "Add to Shopping List":

1. The app calls `POST /api/bring` with the `recipeId`
2. The API constructs a public URL: `https://galleybook.com/share/<share_token>`
3. This URL is sent to Bring!'s deeplink API: `POST https://api.getbring.com/rest/bringrecipes/deeplink`
4. Bring!'s servers fetch the share page, which has **Schema.org Recipe** microdata (`itemprop="recipeIngredient"`)
5. Bring! returns a deeplink that opens the Bring! app with ingredients pre-loaded
6. The app redirects the user to this deeplink

The `/share/[token]` route is public (no auth) so Bring!'s servers can access it. The share token is a separate UUID from the recipe's private ID.

---

## Deployment (Vercel)

```bash
vercel
```

Set all environment variables in the Vercel dashboard. Add `galleybook.com` as a custom domain.

---

## Project Structure

```
app/
├── (app)/              # Authenticated screens
│   ├── library/        # Recipe library
│   ├── recipe/[id]/    # Recipe detail + Bring! button
│   ├── new/            # Add recipe (manual + AI link import)
│   ├── recommendations/# AI-powered discovery
│   └── settings/       # Profile + Galley + Sources
├── auth/               # Login + Google OAuth callback
├── share/[token]/      # Public share page (Schema.org for Bring!)
└── api/
    ├── recipes/        # CRUD + AI parse
    ├── bring/          # Bring! deeplink generation
    ├── recommendations/# Perplexity discovery
    ├── votes/          # Ratings
    ├── galleys/        # Create galley
    ├── invites/        # Member invites
    └── sources/        # Recommendation sources
```
