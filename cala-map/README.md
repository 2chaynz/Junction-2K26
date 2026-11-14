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

## Ask (Gemini)
- Box at the top of the map: plain-language questions, e.g. "a startup doing food and AI".
- `POST /api/ask` runs inside the Vite server (`server/ask.mjs`), so `GEMINI_API_KEY` never reaches the browser. Works in `npm run dev` and `npm run preview`; a static deploy needs its own function.
- Flow: query embedding vs `.cache/embeddings.json` → top 30 → Gemini picks up to 8 and says why → picks light up on the map.
- In parallel, Cala answers live (`POST /v1/knowledge/search`, needs `CALA_API_KEY` with credits): sourced prose, its sources, and the startups it names light up if they are on the map. If Cala fails (e.g. no credits), the card says why and the map answer still shows.
- Cala MCP for Claude Code while building: `claude mcp add -s local --transport http cala https://api.cala.ai/mcp/ --header "X-API-KEY: <key>"`.

## Land necks
- `scripts/embed.mjs` flags startups whose embedding sits almost as close to another sector's centroid as to their own (`src/data/bridges.json`, up to 8 per island pair).
- Linked islands are placed side by side and joined by a strip of land; those startups live on it, each on its own sector's side, colour blending across.

## Data pipeline
```
node scripts/import-cala.mjs        # full import (needs Cala credits)
node scripts/build-from-cache.mjs   # rebuild startups.json from cached searches, no API calls
node scripts/embed.mjs              # Gemini embeddings -> similarity positions + bridges (TF-IDF without a key)
node scripts/summarize.mjs         # Gemini web-grounded summary per startup (GEMINI_API_KEY), resumable
```
- Optional stack: Context.dev for live news per startup; Gemini/Gemma for embeddings and summaries.

## Config
- Login (optional): create a Supabase project, run `supabase/schema.sql` in its SQL editor, enable Email auth, then set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` (see `.env.example`). Without them the app runs as guest with localStorage.
- `.env` (gitignored): `CALA_API_KEY`, sent as header `X-API-KEY`. Key from https://console.cala.ai/api-keys.
- `GEMINI_API_KEY` in `.env` for `scripts/summarize.mjs`. Never shipped to the browser: summaries are baked into `src/data/summaries.json`.

## Todo from humans
- [ ] Own branding (name, logo, palette). Copy layout and interactions, not zig-zag's logo or assets.
