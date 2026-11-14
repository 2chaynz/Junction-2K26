# SiteLens video (Remotion)

A 56-second fast-paced product cut (opens on the 3D building, one door question, 12 doors light up) made of **real screen recordings of the running app**, zooms and burned-in captions
(it works muted), plus a numbers scene built from results files. No voice-over or b-roll yet.

## Rebuild it
```
# 1. the demo must be running on http://127.0.0.1:8000 (node scripts/dev.mjs, dataset preview in ../junction-data)
cd video && npm install
node capture/capture.mjs            # records every scene (or: node capture/capture.mjs swiss)
# 2. numbers from results files, nothing typed by hand
python -m eval.score --name video-dev        # held-out dev split (from the repo root)
node capture/numbers.mjs                     # writes public/numbers.json (also reads web/public/versus.json)
# 3. look at it / render it (uses your installed Chrome, no browser download)
npx remotion studio src/index.ts
npx remotion render src/index.ts SiteLens out/sitelens.mp4 --browser-executable="C:/Program Files/Google/Chrome/Application/chrome.exe"
```

## How it works
- `capture/capture.mjs` drives Chrome with Playwright at 1920x1080 and types the questions like a person. It takes
  frames from Chrome's screencast (a video recorder would need a separate ffmpeg download) with a red cursor dot, and
  writes `public/clips/<scene>/` (git-ignored; re-record any time).
- `src/SiteLens.tsx` plays each clip back by timestamp, with zoom keyframes and captions per scene, and the numbers scene.
- Cut list (scene ids and lengths in seconds): `CUTS` in `src/SiteLens.tsx`; each cut says which raw clip second it starts at and its playback speed.

## Rules we keep
- Real UI only; Remotion adds zooms, captions and charts. Never mock up product screens or results.
- Numbers on screen come from `eval/results/*.jsonl` and `web/public/versus.json`. If the model or scores change,
  re-run the two commands under step 2 and re-render.
- Do **not** film the app's Benchmark tab: its text says the dev split was "never used for training", which is not true
  for the full-dataset scanned plans (the detector trained on them). The numbers scene here uses the preview split only.
- Total length must stay under 2 minutes (it is 56 s).

## Not done yet (T2)
Voice-over (ElevenLabs), Higgsfield b-roll, a pain opener, takeoff / what-changed / measure clips (add scenes to
`capture/capture.mjs` and `SCENES`).
