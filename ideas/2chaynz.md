# Ideas — 2chaynz

## Summary
- **Main candidates:** Aalto Humanoid (in, world-model training on Verda). Liked, to discuss: Stoa Blueprints, Arduino Green, Cala startup map, Beyond the Clinic (Timestral EEG), AfterQuery (hidden-rules game).
- **Side project:** Bahn Spread (2chaynz + agents, OR-Tools).
- **Blocked:** Intel (no station), Meta (no glasses), Rokoko (no gloves).
- **Stack on top:** Verda, Gemini, Gemma, Nemotron (pick Gemini/Gemma or Nemotron), Arduino UNO Q (if hardware), Context.dev (if Cala), ElevenLabs.

## Challenge triage
Verdict per challenge: in / maybe / out, plus ideas. Briefs: Junction Platform → Challenges.

| # | Challenge | Partner | Prize (1st) | Verdict | Notes / ideas |
|---|---|---|---|---|---|
| 1 | Decode the Noise | Hostinger | €2k | out | Crowded, labeled data hard in 48h |
| 2 | Earned Trust in AI Code | Tieto | €2k | out | Concept-heavy, weak on stage |
| 3 | Spread | Bahn Express | €2k | in (side project) | 2chaynz + agents in parallel; OR-Tools for pricing/dispatch; Sun 08:00 final |
| 4 | Break the Agent | AfterQuery | €3k + work trial | maybe | Game with hidden rules (e.g. gravity flips); frontier LLM must discover rules and fails; our reference bot learns a world model (Ha & Schmidhuber 2018, DreamerV3, Genie) and wins. Reproducible gap + small-model tiebreaker on Verda |
| 5 | Trusted Trade Agents | Valio Aimo | €4k | out | (on ccolver shortlist; idea if revived: fridge sensor triggers agent reorder) |
| 6 | Internet Butler | Exa | $2.5k + $5k credits | out | Crowded |
| 7 | Green European Renaissance | Arduino | Ventuno Q/member | maybe (liked) | No idea yet, brainstorm with team; stacks with Arduino UNO Q tech challenge |
| 8 | AI Glasses | Meta | Ray-Ban Meta/member | blocked | Interested, but no glasses left to borrow |
| 9 | Intel Physical AI | Ignite Next x Intel | €5k | out (no station) | Team favorite, but all robot arms taken |
| 10 | Robot Teleoperation | Rokoko | gear €4,990 | blocked | No gloves secured; would have combined with Intel |
| 11 | Aaltonomous Humanoid | Aalto | €2k + real G1 run | in (strong) | Best plan B after Intel; idea: world-model training (Dreamer-style) in Isaac Sim on Verda GPUs; no station needed; stack Verda |
| 12 | Make Unicorns Real | Cala | ~€5k trips + €1k credits | maybe (idea) | Map-style explorer like zig-zag.fm but for startups: each sector is an "island" (e.g. FinTech), startups listed there from Cala data, investors browse/explore. Ref: https://www.zig-zag.fm/6889~2996/track~11871092 |
| 13 | Personal Economic Trainer | S-Pankki | €2k Airbnb | out | Classic, crowded |
| 14 | Equal Care Across Finland | AstraZeneca | €1k | out | Small prize, missed briefing |
| 15 | Beyond the Clinic | Aalto | TBA | maybe (idea) | Use Mistral Timestral (time-series model, https://mistral.ai/fr/news/timestral/) to analyse brain waves (EEG) at home, closed loop; discuss later. Ask Aalto booth for prize |
| 16 | Make Blueprints Talk | Stoa | €1k + work trial | maybe (liked) | To discuss with team; hybrid CV + frontier model, answers must point to location in drawing |
| 17 | Web as Real-Time DB | Context.dev | €2k | out | (tech-challenge version still stackable with Cala map) |
| 18 | Rethinking Recruitment | City of Espoo | €1.5k | out | Too vague |
| 19 | Wikipedia Through Time | MariaDB | €1k | out | Small prize |

## Tech challenges (stackable)
| # | Challenge | Prize (1st) | Verdict | Notes |
|---|---|---|---|---|
| T1 | Best Use of Verda | $10k credits | in | Free GPUs for Aalto humanoid training; post summary on Verda Discord |
| T2 | Best Use of Gemini API | €4k + $1k GCP/member | in | Parse humanoid text instruction + vision; must be central |
| T3 | Best Use of Gemma | €1k x3 teams | in | Local open model in humanoid policy (instruction parsing) on Verda; 3 equal winners |
| T4 | Best Use of Codex | $10k API credits | out | |
| T5 | Best Use of Nemotron | RTX 5080 x2 teams | in (pick one) | Choose Gemini/Gemma vs Nemotron later; Nemotron strong for Stoa (reads drawings) |
| T6 | Best Use of Modal | $2k + $3k credits | out | Overlaps Verda |
| T7 | Best Use of Aiven | €1k | out | |
| T8 | Best Use of Arduino UNO Q | UNO Q + kit/member | in | If hardware main (Arduino Green / Beyond the Clinic) |
| T9 | Atech Real World | Pro kit | out | Overlaps Arduino |
| T10 | Best Use of Context.dev | €750 | in | If Cala map: enrich startups with live web data |
| T11 | Oxylabs Web API | €1k Apple + $500/member | out | Redundant with Context.dev |
| T12 | Best use of CRACI | LEGO/member | out | |
| T13 | Best Use of Cloudinary | $500 Amazon/member | out | |
| T14 | Best Use of ElevenLabs (MLH) | Earbuds | in | Voice coach for Beyond the Clinic; robot narration for Aalto; promo code in MLH email |
| T15 | Best Use of Entire (MLH) | Projector | out | Our repo workflow already covers it |
| T16 | Best Use of Solana (MLH) | HW wallets | out | |
| T17 | Best Use of Tiger Data (MLH) | Stream Deck Mini | out | |
| T18 | Best Use of Vultr (MLH) | M5Stack monitor | out | Overlaps Verda |
| T19 | Best Use of MongoDB Atlas (MLH) | M5Stack IoT kit | out | |
