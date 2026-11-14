# SiteLens UI v2: decisions (2chaynz, grill, Sat 14 Nov)

Replaces the blueprint/3-column v1 (PR #22/#25). Simple, clean, practical. No AI slop.

## Banned
- Gradients, sparkle icons, glassmorphism, emojis, big rounded cards, "AI-powered" badges, shadows.

## Layout (laptop first: 1440x900, 1920x1080)
- Top bar: `SiteLens` · drawing search · `Random` · right: `How it works` `Benchmark` links.
- Drawing zone ~70%: drawing full size, pan/zoom.
- Chat zone ~30%: messages, 3 Stoa question chips above input, input.
- Phone layout: later, only if time.

## Style
- bg `#fff`, lines `#e5e5e5`, 1px, no shadows, 4px radius.
- One accent: redline red `#d92d20` (marks, citations, active, errors).
- Inter for UI, mono for numbers. Caveat only for marks on the plan.
- Blueprint look only in pitch/3D.

## First run
- Best Swiss vector demo drawing open.
- Chat: "Ask anything about this drawing." + 3 Stoa chips. No splash.

## Picker
- Search combobox, `/` focuses. Filters by name.
- Groups: Demo (5-6 hand-picked, one per type) first, then Scanned plans · Vector plans · BIM models · Schedules (with counts).
- Row: small thumb, name, type, Q count.
- `Random`: loads drawing + pre-fills a Stoa question.

## Chat
- Every message → `/api/ask` with the open drawing.
- No path answers → Gemini text with a short SiteLens prompt. Tagged "general · not from the drawing", no citations, no Stoa stamp, cost/time shown.

## Answer message
```
4 WCs  [1][2][3][4]
vector · €0.000 · 0.1s · ✓ Stoa
> Steps (3)
```
- Wrong vs Stoa: red `✗ Stoa: 12.9`. Shown honestly.
- confidence < 0.6: red "please check".
- No answer: "Couldn't read this from the drawing. Tried: vector, detector, VLM".

## Citations
- Latest answer: all marks on, numbered; view fits them.
- Click `[n]` or a mark → zoom + pulse, others dim. Hover is two-way (mark ↔ chip).
- Older answers' marks hidden; click the message to bring them back.
- More than 9 hits: `[1]…[14]` + "show all".

## Extras (stretch, each ships alone, dropped if not done by 22:00)
- `How it works`, `Benchmark`: own pages, same style, back arrow.
- 3D: IFC only, `2D | 3D` toggle in the drawing corner; citations highlight the IFC element.
- Voice: hidden mic slot in the input (right). Later ElevenLabs STT; optional speaker icon per answer.
