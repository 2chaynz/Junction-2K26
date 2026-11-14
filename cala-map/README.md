# Cala map (side project)

Challenge: Cala "Make Unicorns Real". Startup explorer modelled on zig-zag.fm: sectors are islands, startups are tiles, investors navigate. Full UI inventory: `FEATURES.md`.

## Run
```
npm install
npm run dev
```

## Stack
- Vite + React + TypeScript, deck.gl (same renderer as zig-zag).
- Layout: one island per sector, each with its own random silhouette (lobes, stretch, Perlin coast), packed at random bearings (`src/perlin.ts`, `src/layout.ts`). Every land tile is a startup. Inside an island, similar startups are neighbours (`src/data/positions.json`).
- Data: Cala API (`/v1/knowledge/query`, `/v1/entities`), cached in `.cache/`. Mock data only if `src/data/startups.json` is missing.

## Data pipeline
```
node scripts/import-cala.mjs        # full import (needs Cala credits)
node scripts/build-from-cache.mjs   # rebuild startups.json from cached searches, no API calls
node scripts/embed.mjs              # similarity positions (TF-IDF now, Gemini later)
node scripts/summarize.mjs         # Gemini web-grounded summary per startup (GEMINI_API_KEY), resumable
```
- Optional stack: Context.dev for live news per startup; Gemini/Gemma for embeddings and summaries.

## Config
- Login (optional): create a Supabase project, run `supabase/schema.sql` in its SQL editor, enable Email auth, then set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` (see `.env.example`). Without them the app runs as guest with localStorage.
- `.env` (gitignored): `CALA_API_KEY`, sent as header `X-API-KEY`. Key from https://console.cala.ai/api-keys.
- `GEMINI_API_KEY` in `.env` for `scripts/summarize.mjs`. Never shipped to the browser: summaries are baked into `src/data/summaries.json`.

## Todo from humans
- [ ] Own branding (name, logo, palette). Copy layout and interactions, not zig-zag's logo or assets.
