import React, { useEffect, useState } from "react";
import {
  AbsoluteFill, Easing, Img, Series, continueRender, delayRender, interpolate, staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";

export const FPS = 30;
const RED = "#d92d20";
const INK = "#0e1117";
const FONT = "Inter, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "'JetBrains Mono', Consolas, monospace";

// ---------- real screen clips: frames captured from Chrome (capture/capture.mjs), played back by timestamp ----------
type Frame = { t: number; file: string };
const frameCache: Record<string, Frame[]> = {};

const Clip: React.FC<{ name: string; from?: number; rate?: number }> = ({ name, from = 0, rate = 1 }) => {
  const [frames, setFrames] = useState<Frame[] | null>(frameCache[name] ?? null);
  const [handle] = useState(() => delayRender(`frames ${name}`));
  useEffect(() => {
    if (frameCache[name]) { setFrames(frameCache[name]); continueRender(handle); return; }
    fetch(staticFile(`clips/${name}/frames.json`)).then((r) => r.json()).then((d) => {
      frameCache[name] = d.frames; setFrames(d.frames); continueRender(handle);
    });
  }, [name, handle]);
  const frame = useCurrentFrame();
  if (!frames) return null;
  const t = from + (frame / FPS) * rate;
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (frames[mid].t <= t) lo = mid; else hi = mid - 1; }
  return <Img src={staticFile(`clips/${name}/${frames[lo].file}`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
};

// ---------- camera: smooth zoom keyframes (seconds inside the scene; x,y = focus point 0..1) ----------
type Key = { at: number; x: number; y: number; s: number };
const Zoom: React.FC<{ keys: Key[]; children: React.ReactNode }> = ({ keys, children }) => {
  const t = useCurrentFrame() / FPS;
  const at = keys.map((k) => k.at);
  const opt = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) } as const;
  const s = interpolate(t, at, keys.map((k) => k.s), opt);
  const x = interpolate(t, at, keys.map((k) => k.x), opt);
  const y = interpolate(t, at, keys.map((k) => k.y), opt);
  return <AbsoluteFill style={{ transform: `scale(${s})`, transformOrigin: `${x * 100}% ${y * 100}%` }}>{children}</AbsoluteFill>;
};

// ---------- burned-in captions (the video has to work muted) ----------
type Cap = { from: number; to: number; text: string; sub?: string };
const Captions: React.FC<{ caps: Cap[] }> = ({ caps }) => {
  const t = useCurrentFrame() / FPS;
  const c = caps.find((k) => t >= k.from && t < k.to);
  if (!c) return null;
  const a = interpolate(t, [c.from, c.from + 0.35, c.to - 0.3, c.to], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 70, display: "flex", justifyContent: "center", opacity: a, transform: `translateY(${(1 - a) * 14}px)` }}>
      <div style={{ background: "rgba(14,17,23,.92)", borderLeft: `8px solid ${RED}`, padding: "20px 40px", maxWidth: 1500, borderRadius: 6 }}>
        <div style={{ fontFamily: FONT, fontSize: 48, fontWeight: 600, color: "#fff", lineHeight: 1.2 }}>{c.text}</div>
        {c.sub && <div style={{ fontFamily: MONO, fontSize: 28, color: "#f4a29a", marginTop: 8 }}>{c.sub}</div>}
      </div>
    </div>
  );
};

const ClipScene: React.FC<{ name: string; from: number; rate: number; keys: Key[]; caps: Cap[] }> = ({ name, from, rate, keys, caps }) => (
  <AbsoluteFill style={{ background: "#fff" }}>
    <Zoom keys={keys}><Clip name={name} from={from} rate={rate} /></Zoom>
    <Captions caps={caps} />
  </AbsoluteFill>
);

// ---------- title / close ----------
const Title: React.FC<{ big: string; line: string; small: string }> = ({ big, line, small }) => {
  const f = useCurrentFrame();
  const a = interpolate(f, [0, 18], [0, 1], { extrapolateRight: "clamp" });
  const b = interpolate(f, [14, 34], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: INK, justifyContent: "center", alignItems: "center", fontFamily: FONT }}>
      <div style={{ fontSize: 150, fontWeight: 700, color: "#fff", opacity: a, letterSpacing: -3 }}>{big}</div>
      <div style={{ fontSize: 56, color: RED, opacity: b, marginTop: 10, transform: `translateY(${(1 - b) * 16}px)`, fontWeight: 600 }}>{line}</div>
      <div style={{ fontSize: 30, color: "#9aa3b2", opacity: b, marginTop: 44, fontFamily: MONO }}>{small}</div>
    </AbsoluteFill>
  );
};

// ---------- numbers scene: built from results files, nothing typed by hand ----------
type Numbers = {
  sources: { label: string; n: number; acc: number }[];
  versus: { ours: { correct: number; n: number; eur: number }; vlm: { correct: number; n: number; eur: number }; model: string };
  note: string;
};
const NumbersScene: React.FC = () => {
  const [d, setD] = useState<Numbers | null>(null);
  const [handle] = useState(() => delayRender("numbers"));
  useEffect(() => { fetch(staticFile("numbers.json")).then((r) => r.json()).then((j) => { setD(j); continueRender(handle); }); }, [handle]);
  const f = useCurrentFrame();
  if (!d) return null;
  const grow = (i: number) => interpolate(f, [12 + i * 6, 42 + i * 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const vs = interpolate(f, [150, 180], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const eur = (v: number) => `€${v.toFixed(3)}`;
  return (
    <AbsoluteFill style={{ background: "#fff", fontFamily: FONT, padding: "80px 110px", color: INK }}>
      <div style={{ fontSize: 58, fontWeight: 700 }}>Measured on drawings it never trained on</div>
      <div style={{ fontSize: 28, color: "#667085", marginTop: 8 }}>Stoa's preview set, held-out split. Exact counts, ±2% on areas.</div>
      <div style={{ display: "flex", gap: 90, marginTop: 56 }}>
        <div style={{ flex: 1.25 }}>
          {d.sources.map((s, i) => (
            <div key={s.label} style={{ marginBottom: 30 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 34, marginBottom: 8 }}>
                <span>{s.label}</span><span style={{ fontFamily: MONO, fontWeight: 600 }}>{(s.acc * 100 * grow(i)).toFixed(1)}%</span>
              </div>
              <div style={{ height: 22, background: "#f2f4f7", borderRadius: 11 }}>
                <div style={{ height: 22, width: `${s.acc * 100 * grow(i)}%`, background: RED, borderRadius: 11 }} />
              </div>
              <div style={{ fontSize: 22, color: "#98a2b3", marginTop: 4 }}>{s.n.toLocaleString()} questions</div>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, opacity: vs, transform: `translateY(${(1 - vs) * 24}px)` }}>
          <div style={{ fontSize: 34, fontWeight: 600, marginBottom: 24 }}>Same {d.versus.ours.n} questions, same drawings</div>
          <div style={{ border: `3px solid ${RED}`, borderRadius: 14, padding: "26px 34px", marginBottom: 22 }}>
            <div style={{ fontSize: 28, color: RED, fontWeight: 600 }}>SiteLens</div>
            <div style={{ fontSize: 84, fontWeight: 700, fontFamily: MONO }}>{d.versus.ours.correct}/{d.versus.ours.n}</div>
            <div style={{ fontSize: 34, fontFamily: MONO }}>{eur(d.versus.ours.eur)} in total</div>
          </div>
          <div style={{ border: "3px solid #d0d5dd", borderRadius: 14, padding: "26px 34px" }}>
            <div style={{ fontSize: 28, color: "#667085", fontWeight: 600 }}>{d.versus.model}, whole sheet</div>
            <div style={{ fontSize: 84, fontWeight: 700, fontFamily: MONO, color: "#667085" }}>{d.versus.vlm.correct}/{d.versus.vlm.n}</div>
            <div style={{ fontSize: 34, fontFamily: MONO, color: "#667085" }}>{eur(d.versus.vlm.eur)} in total</div>
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 110, right: 110, bottom: 46, fontSize: 22, color: "#98a2b3", fontFamily: MONO }}>{d.note}</div>
    </AbsoluteFill>
  );
};

// ---------- the cut ----------
const s = (sec: number) => Math.round(sec * FPS);
const SCENES = [
  { id: "title", sec: 5 },
  { id: "swiss", sec: 13 },
  { id: "scan", sec: 11 },
  { id: "schedule", sec: 11 },
  { id: "bim", sec: 7 },
  { id: "numbers", sec: 14 },
  { id: "close", sec: 5 },
];
export const TOTAL = SCENES.reduce((a, c) => a + s(c.sec), 0);

export const SiteLens: React.FC = () => (
  <AbsoluteFill style={{ background: "#fff" }}>
    <Series>
      <Series.Sequence durationInFrames={s(5)}>
        <Title big="SiteLens" line="Ask a drawing. See the proof." small="Junction 2026 · Stoa: Make Blueprints Talk" />
      </Series.Sequence>

      <Series.Sequence durationInFrames={s(13)}>
        <ClipScene name="swiss" from={4.5} rate={1.6}
          keys={[{ at: 0, x: .5, y: .5, s: 1 }, { at: 3.8, x: .5, y: .5, s: 1 }, { at: 4.6, x: .99, y: .98, s: 1.7 }, { at: 6.4, x: .99, y: .98, s: 1.7 },
            { at: 7.4, x: .99, y: .45, s: 1.5 }, { at: 9.6, x: .99, y: .45, s: 1.5 }, { at: 10.6, x: .38, y: .62, s: 1.45 }, { at: 12.4, x: .38, y: .62, s: 1.45 }, { at: 13, x: .5, y: .5, s: 1 }]}
          caps={[{ from: .4, to: 6.4, text: "Ask a drawing a question." },
            { from: 6.6, to: 9.8, text: "It shows its steps, in plain words." },
            { from: 10, to: 12.9, text: "12 doors, every one marked on the plan.", sub: "✓ matches Stoa's answer key · vector reader · €0 · 1.2 s" }]} />
      </Series.Sequence>

      <Series.Sequence durationInFrames={s(11)}>
        <ClipScene name="scan" from={6} rate={2.2}
          keys={[{ at: 0, x: .5, y: .5, s: 1 }, { at: 1.4, x: .99, y: .98, s: 1.7 }, { at: 3, x: .99, y: .98, s: 1.7 }, { at: 4, x: .99, y: .45, s: 1.5 }, { at: 7, x: .99, y: .45, s: 1.5 },
            { at: 7.6, x: .99, y: .98, s: 1.7 }, { at: 9, x: .99, y: .98, s: 1.7 }, { at: 9.8, x: .5, y: .5, s: 1 }, { at: 11, x: .5, y: .5, s: 1 }]}
          caps={[{ from: .3, to: 3.8, text: "Scanned plans: a detector we trained reads them." },
            { from: 4, to: 7.6, text: "Ask in Finnish, or in plain words." },
            { from: 7.8, to: 10.9, text: "Every answer points at its evidence." }]} />
      </Series.Sequence>

      <Series.Sequence durationInFrames={s(11)}>
        <ClipScene name="schedule" from={7} rate={1.9}
          keys={[{ at: 0, x: .5, y: .5, s: 1 }, { at: 1.4, x: .99, y: .98, s: 1.7 }, { at: 3.7, x: .99, y: .98, s: 1.7 }, { at: 4.4, x: .99, y: .45, s: 1.5 }, { at: 7.4, x: .99, y: .45, s: 1.5 },
            { at: 8, x: .5, y: .5, s: 1 }, { at: 11, x: .5, y: .5, s: 1 }]}
          caps={[{ from: .3, to: 4, text: "Schedules: it reads the table on the sheet." },
            { from: 4.2, to: 7.6, text: "It works out the answer, step by step." },
            { from: 7.8, to: 10.9, text: "5 doors carry note C. All five rows highlighted." }]} />
      </Series.Sequence>

      <Series.Sequence durationInFrames={s(7)}>
        <ClipScene name="bim" from={13.5} rate={1.3} keys={[{ at: 0, x: .5, y: .5, s: 1 }, { at: 7, x: .5, y: .5, s: 1 }]}
          caps={[{ from: .3, to: 6.8, text: "BIM models open in 3D: orbit the building, filter by floor." }]} />
      </Series.Sequence>

      <Series.Sequence durationInFrames={s(14)}><NumbersScene /></Series.Sequence>

      <Series.Sequence durationInFrames={s(5)}>
        <Title big="Every answer proves itself." line="Exact where the file allows. A detector for scans. A language model last." small="SiteLens · Junction 2026" />
      </Series.Sequence>
    </Series>
  </AbsoluteFill>
);
