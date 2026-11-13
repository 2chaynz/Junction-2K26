# Cala map (side project)

Challenge: Cala "Make Unicorns Real". Startup explorer modelled on zig-zag.fm: sectors are islands, startups are tiles, investors navigate. Full UI inventory: `FEATURES.md`.

## Run
```
npm install
npm run dev
```

## Stack
- Vite + React + TypeScript, deck.gl (same renderer as zig-zag).
- Layout: startups grouped by sector, each sector packed into an island blob on a grid.
- Data: Cala API (`/v1/knowledge/query`, `/v1/entities`), cached to JSON. Mock data in `src/data/mock.ts` until wired.
- Optional stack: Context.dev for live news per startup; Gemini/Gemma for embeddings and summaries.

## Config
- `.env` (gitignored): `CALA_API_KEY`, sent as header `X-API-KEY`. Key from https://console.cala.ai/api-keys.

## Todo from humans
- [ ] Own branding (name, logo, palette). Copy layout and interactions, not zig-zag's logo or assets.
