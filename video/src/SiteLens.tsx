import React, { useEffect, useState } from "react";
import {
  AbsoluteFill, Easing, Img, Series, continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";

export const FPS = 30;
const RED = "#d92d20";
const INK = "#0e1117";
const FONT = "Inter, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "'JetBrains Mono', Consolas, monospace";

// ---------- real screen clips: frames captured from Chrome (capture/capture.mjs), played back by timestamp ----------
type Frame = { t: number; file: string };
const frameCache: Record<string, Frame[]> = {};

/** `from` = clip second at the start of this scene, `rate` = playback speed (0 = freeze frame). */
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

// ---------- camera: zoom keyframes (seconds inside the scene; x,y = focus point 0..1) ----------
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
const STILL: Key[] = [{ at: 0, x: .5, y: .5, s: 1 }, { at: 99, x: .5, y: .5, s: 1 }];

// ---------- energy: wipe between cuts, pop-in captions, number slam, stamp ----------
const Wipe: React.FC = () => {
  const f = useCurrentFrame();
  if (f > 12) return null;
  const x = interpolate(f, [0, 12], [-105, 105], { easing: Easing.inOut(Easing.cubic) });
  return <AbsoluteFill style={{ background: RED, transform: `translateX(${x}%) skewX(-12deg)`, zIndex: 50 }} />;
};

const Pop: React.FC<{ text: string; from?: number; to: number; sub?: string; where?: "bottom" | "top" }> = ({ text, from = 0.15, to, sub, where = "bottom" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < from || t > to) return null;
  const sp = spring({ frame: frame - from * fps, fps, config: { damping: 11, stiffness: 190 } });
  const out = interpolate(t, [to - 0.15, to], [1, 0], { extrapolateLeft: "clamp" });
  return (
    <div style={{ position: "absolute", left: 0, right: 0, [where]: 80, display: "flex", justifyContent: "center", opacity: out, zIndex: 20 }}>
      <div style={{ transform: `scale(${0.55 + 0.45 * sp})`, background: INK, borderLeft: `10px solid ${RED}`, padding: "16px 44px", borderRadius: 6, boxShadow: "0 12px 40px rgba(0,0,0,.35)" }}>
        <div style={{ fontFamily: FONT, fontSize: 80, fontWeight: 800, color: "#fff", lineHeight: 1.05, letterSpacing: -1 }}>{text}</div>
        {sub && <div style={{ fontFamily: MONO, fontSize: 28, color: "#f4a29a", marginTop: 6 }}>{sub}</div>}
      </div>
    </div>
  );
};

/** Big number slamming in, with a label and a stamp that lands after it. */
const Slam: React.FC<{ big: string; label: string; at: number; stamp?: string; stampAt?: number; mono?: string }> = ({ big, label, at, stamp, stampAt = at + 0.9, mono }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = spring({ frame: frame - at * fps, fps, config: { damping: 9, stiffness: 150, mass: 0.8 } });
  const b = spring({ frame: frame - stampAt * fps, fps, config: { damping: 8, stiffness: 220 } });
  if (frame < at * fps) return null;
  return (
    <div style={{ position: "absolute", left: 70, bottom: 70, zIndex: 20, fontFamily: FONT }}>
      <div style={{ background: "rgba(14,17,23,.94)", borderRadius: 16, padding: "10px 48px 22px", transform: `scale(${0.4 + 0.6 * a})`, transformOrigin: "left bottom", opacity: Math.min(a * 1.5, 1) }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
          <span style={{ fontSize: 230, fontWeight: 800, color: "#fff", letterSpacing: -8, lineHeight: 1 }}>{big}</span>
          <span style={{ fontSize: 76, fontWeight: 700, color: RED }}>{label}</span>
        </div>
        {mono && <div style={{ fontFamily: MONO, fontSize: 28, color: "#9aa3b2", marginTop: -6 }}>{mono}</div>}
      </div>
      {stamp && frame >= stampAt * fps && (
        <div style={{ position: "absolute", left: 640, bottom: 70, transform: `rotate(-8deg) scale(${0.3 + 0.7 * b})`, opacity: Math.min(b * 2, 1),
          border: "8px solid #12b76a", color: "#12b76a", borderRadius: 14, padding: "6px 30px", fontSize: 62, fontWeight: 800, background: "rgba(255,255,255,.92)" }}>{stamp}</div>
      )}
    </div>
  );
};

const Scene: React.FC<{ name: string; from: number; rate: number; keys?: Key[]; children?: React.ReactNode }> = ({ name, from, rate, keys = STILL, children }) => (
  <AbsoluteFill style={{ background: "#fff" }}>
    <Zoom keys={keys}><Clip name={name} from={from} rate={rate} /></Zoom>
    {children}
    <Wipe />
  </AbsoluteFill>
);

// ---------- title / close ----------
const Title: React.FC<{ big: string; line: string; small: string; bigSize?: number }> = ({ big, line, small, bigSize = 190 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = spring({ frame, fps, config: { damping: 10, stiffness: 170 } });
  const b = spring({ frame: frame - 8, fps, config: { damping: 14, stiffness: 150 } });
  return (
    <AbsoluteFill style={{ background: INK, justifyContent: "center", alignItems: "center", fontFamily: FONT, textAlign: "center", padding: "0 120px" }}>
      <div style={{ fontSize: bigSize, fontWeight: 800, color: "#fff", transform: `scale(${0.5 + 0.5 * a})`, opacity: Math.min(a * 2, 1), letterSpacing: -5, lineHeight: 1.02 }}>{big}</div>
      <div style={{ fontSize: 58, color: RED, opacity: b, marginTop: 22, transform: `translateY(${(1 - b) * 24}px)`, fontWeight: 700 }}>{line}</div>
      <div style={{ fontSize: 30, color: "#9aa3b2", opacity: b, marginTop: 40, fontFamily: MONO }}>{small}</div>
      <Wipe />
    </AbsoluteFill>
  );
};

// ---------- data from results files (capture/numbers.mjs): nothing typed by hand ----------
type Numbers = {
  sources: { label: string; n: number; acc: number }[];
  overall: { n: number; acc: number; eurPerAnswer: number };
  hook: { truth: number; ours: number; vlm: number; model: string };
  versus: { ours: { correct: number; n: number; eur: number }; vlm: { correct: number; n: number; eur: number }; model: string };
  note: string;
};
const useNumbers = () => {
  const [d, setD] = useState<Numbers | null>(null);
  const [handle] = useState(() => delayRender("numbers"));
  useEffect(() => { fetch(staticFile("numbers.json")).then((r) => r.json()).then((j) => { setD(j); continueRender(handle); }); }, [handle]);
  return d;
};

// ---------- split screen: the frontier model vs SiteLens on the same drawing ----------
const Versus: React.FC = () => {
  const d = useNumbers();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!d) return null;
  const sp = (at: number, damping = 9) => spring({ frame: frame - at * fps, fps, config: { damping, stiffness: 170 } });
  const l = sp(0.3), x = sp(1.3, 7), r = sp(2.3), ok = sp(3.3, 7), cost = sp(4.8, 14);
  const eur = (v: number) => `€${v.toFixed(3)}`;
  return (
    <AbsoluteFill style={{ background: INK, fontFamily: FONT }}>
      <AbsoluteFill style={{ opacity: 0.18, filter: "blur(6px)" }}><Clip name="swiss" from={20} rate={0} /></AbsoluteFill>
      <div style={{ position: "absolute", top: 60, left: 0, right: 0, textAlign: "center", fontSize: 54, fontWeight: 700, color: "#fff" }}>
        Same drawing. Same question: <span style={{ color: RED }}>how many doors?</span>
      </div>
      <div style={{ position: "absolute", top: 190, left: 110, width: 800, transform: `scale(${0.7 + 0.3 * l})`, opacity: l }}>
        <div style={{ border: "4px solid #475467", borderRadius: 20, padding: "30px 44px", background: "rgba(255,255,255,.06)", position: "relative" }}>
          <div style={{ fontSize: 34, color: "#98a2b3", fontWeight: 600 }}>{d.hook.model}, whole sheet</div>
          <div style={{ fontSize: 330, fontWeight: 800, color: "#98a2b3", lineHeight: 1.05 }}>{d.hook.vlm}</div>
          <div style={{ fontSize: 40, fontFamily: MONO, color: "#98a2b3" }}>no proof shown</div>
          <div style={{ position: "absolute", right: 30, top: 70, transform: `rotate(10deg) scale(${0.3 + 0.7 * x})`, opacity: Math.min(x * 2, 1), color: RED, fontSize: 150, fontWeight: 900 }}>✗</div>
          <div style={{ position: "absolute", right: 40, top: 250, fontSize: 40, color: "#f4a29a", fontFamily: MONO, opacity: x }}>truth: {d.hook.truth}</div>
        </div>
      </div>
      <div style={{ position: "absolute", top: 190, right: 110, width: 800, transform: `scale(${0.7 + 0.3 * r})`, opacity: r }}>
        <div style={{ border: `4px solid ${RED}`, borderRadius: 20, padding: "30px 44px", background: "rgba(217,45,32,.12)", position: "relative" }}>
          <div style={{ fontSize: 34, color: "#fda29b", fontWeight: 600 }}>SiteLens</div>
          <div style={{ fontSize: 330, fontWeight: 800, color: "#fff", lineHeight: 1.05 }}>{d.hook.ours}</div>
          <div style={{ fontSize: 40, fontFamily: MONO, color: "#fda29b" }}>every door marked on the plan</div>
          <div style={{ position: "absolute", right: 30, top: 70, transform: `rotate(-8deg) scale(${0.3 + 0.7 * ok})`, opacity: Math.min(ok * 2, 1), color: "#12b76a", fontSize: 150, fontWeight: 900 }}>✓</div>
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 70, left: 0, right: 0, textAlign: "center", opacity: cost, transform: `translateY(${(1 - cost) * 30}px)` }}>
        <span style={{ fontSize: 62, fontWeight: 800, color: "#fff" }}>Across {d.versus.ours.n} questions: </span>
        <span style={{ fontSize: 62, fontWeight: 800, color: RED }}>{d.versus.ours.correct}/{d.versus.ours.n} for {eur(d.versus.ours.eur)}</span>
        <span style={{ fontSize: 62, fontWeight: 800, color: "#98a2b3" }}> vs {d.versus.vlm.correct}/{d.versus.vlm.n} for {eur(d.versus.vlm.eur)}</span>
      </div>
      <Wipe />
    </AbsoluteFill>
  );
};

// ---------- the numbers, fast ----------
const NumbersScene: React.FC = () => {
  const d = useNumbers();
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!d) return null;
  const grow = (i: number) => interpolate(f, [8 + i * 5, 30 + i * 5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const big = spring({ frame: f - 6, fps, config: { damping: 12, stiffness: 120 } });
  const tail = spring({ frame: f - 60, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ background: "#fff", fontFamily: FONT, color: INK, padding: "70px 110px" }}>
      <div style={{ display: "flex", gap: 90, alignItems: "center", height: "100%" }}>
        <div style={{ flex: 1.2 }}>
          <div style={{ fontSize: 52, fontWeight: 800, marginBottom: 6 }}>On drawings it never trained on</div>
          <div style={{ fontSize: 26, color: "#667085", marginBottom: 40 }}>Stoa's preview set, held-out split. Exact counts, ±2% on areas.</div>
          {d.sources.map((s, i) => (
            <div key={s.label} style={{ marginBottom: 26 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 34, marginBottom: 6 }}>
                <span>{s.label}</span><span style={{ fontFamily: MONO, fontWeight: 700 }}>{(s.acc * 100 * grow(i)).toFixed(1)}%</span>
              </div>
              <div style={{ height: 22, background: "#f2f4f7", borderRadius: 11 }}>
                <div style={{ height: 22, width: `${s.acc * 100 * grow(i)}%`, background: RED, borderRadius: 11 }} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 270, fontWeight: 800, color: RED, transform: `scale(${0.5 + 0.5 * big})`, opacity: Math.min(big * 2, 1), letterSpacing: -8, lineHeight: 1 }}>
            {(d.overall.acc * 100).toFixed(1)}%
          </div>
          <div style={{ fontSize: 40, fontWeight: 700 }}>of {d.overall.n.toLocaleString()} questions right</div>
          <div style={{ fontSize: 56, fontFamily: MONO, fontWeight: 700, marginTop: 34, opacity: tail, transform: `translateY(${(1 - tail) * 20}px)` }}>
            {d.overall.eurPerAnswer < 0.0001 ? "< €0.0001" : `€${d.overall.eurPerAnswer.toFixed(4)}`} <span style={{ fontSize: 34, fontWeight: 600 }}>per answer</span>
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 110, right: 110, bottom: 36, fontSize: 20, color: "#98a2b3", fontFamily: MONO }}>{d.note}</div>
      <Wipe />
    </AbsoluteFill>
  );
};

// ---------- the cut (clip seconds are raw recording seconds; see capture/sheet_*.png for what happens when) ----------
const s = (sec: number) => Math.round(sec * FPS);
const CUTS: { id: string; sec: number }[] = [
  { id: "spin", sec: 2.6 }, { id: "ask3d", sec: 2.4 }, { id: "doors", sec: 4 }, { id: "title", sec: 2 },
  { id: "overview", sec: 3 },
  { id: "swissA", sec: 1.3 }, { id: "swissB", sec: 5.5 },
  { id: "scanA", sec: 0.9 }, { id: "scanB", sec: 3.5 }, { id: "scanC", sec: 0.8 }, { id: "scanD", sec: 3.3 },
  { id: "schedA", sec: 1.4 }, { id: "schedB", sec: 1.8 }, { id: "schedC", sec: 3.5 },
  { id: "versus", sec: 8 }, { id: "numbers", sec: 8 }, { id: "close", sec: 4 },
];
export const TOTAL = CUTS.reduce((a, c) => a + s(c.sec), 0);
const seq = (id: string) => s(CUTS.find((c) => c.id === id)!.sec);

export const SiteLens: React.FC = () => (
  <AbsoluteFill style={{ background: "#fff" }}>
    <Series>
      {/* HOOK: the building in 3D, one question, every door lights up */}
      <Series.Sequence durationInFrames={seq("spin")}>
        <Scene name="hook3d" from={13} rate={1.6}><Pop text="Where are the doors?" to={2.5} /></Scene>
      </Series.Sequence>
      <Series.Sequence durationInFrames={seq("ask3d")}>
        <Scene name="hook3d" from={21.4} rate={2.2}
          keys={[{ at: 0, x: .5, y: .5, s: 1 }, { at: .25, x: .99, y: .98, s: 1.9 }, { at: 2.3, x: .99, y: .98, s: 1.9 }]}><Pop text="Just ask." to={2.3} /></Scene>
      </Series.Sequence>
      <Series.Sequence durationInFrames={seq("doors")}>
        <Scene name="hook3d" from={26.4} rate={1.7}
          keys={[{ at: 0, x: .5, y: .55, s: 1 }, { at: 3.8, x: .5, y: .55, s: 1.25 }]}>
          <Slam big="12" label="doors" at={0.5} stamp="✓ STOA" stampAt={1.5} mono="IFC reader · 4 ms · €0" />
        </Scene>
      </Series.Sequence>
      <Series.Sequence durationInFrames={seq("title")}>
        <Title big="SiteLens" line="Every answer proves itself." small="Junction 2026 · Stoa: Make Blueprints Talk" />
      </Series.Sequence>

      {/* ONE PLACE FOR THE WHOLE SET */}
      <Series.Sequence durationInFrames={seq("overview")}>
        <Scene name="overview" from={0.2} rate={1.1}><Pop text="The whole set, one place." to={2.9} /></Scene>
      </Series.Sequence>

      {/* SWISS: typing at speed, then the marks */}
      <Series.Sequence durationInFrames={seq("swissA")}>
        <Scene name="swiss" from={11.8} rate={3} keys={[{ at: 0, x: .5, y: .5, s: 1 }, { at: .3, x: .99, y: .98, s: 1.7 }, { at: 1.3, x: .99, y: .98, s: 1.7 }]}>
          <Pop text="Plain words." to={1.25} />
        </Scene>
      </Series.Sequence>
      <Series.Sequence durationInFrames={seq("swissB")}>
        <Scene name="swiss" from={15.4} rate={1}
          keys={[{ at: 0, x: .99, y: .45, s: 1.5 }, { at: 1.6, x: .99, y: .45, s: 1.5 }, { at: 2.4, x: .36, y: .62, s: 1.4 }, { at: 5.5, x: .36, y: .62, s: 1.4 }]}>
          <Pop text="Every door marked." to={5.4} sub="12 ✓ matches Stoa's key · vector reader · €0" />
        </Scene>
      </Series.Sequence>

      {/* SCAN: Finnish in, boxed answer out */}
      <Series.Sequence durationInFrames={seq("scanA")}>
        <Scene name="scan" from={10.8} rate={3} keys={[{ at: 0, x: .5, y: .5, s: 1 }, { at: .2, x: .99, y: .98, s: 1.7 }, { at: .9, x: .99, y: .98, s: 1.7 }]}>
          <Pop text="Finnish?" to={0.85} />
        </Scene>
      </Series.Sequence>
      <Series.Sequence durationInFrames={seq("scanB")}>
        <Scene name="scan" from={13.8} rate={1}><Pop text="1 toilet. Boxed." to={3.4} sub="trained detector · €0.00001" /></Scene>
      </Series.Sequence>
      <Series.Sequence durationInFrames={seq("scanC")}>
        <Scene name="scan" from={20.4} rate={3} keys={[{ at: 0, x: .5, y: .5, s: 1 }, { at: .2, x: .99, y: .98, s: 1.7 }, { at: .8, x: .99, y: .98, s: 1.7 }]}>
          <Pop text="Windows too." to={0.75} />
        </Scene>
      </Series.Sequence>
      <Series.Sequence durationInFrames={seq("scanD")}>
        <Scene name="scan" from={25.4} rate={1}><Pop text="Scans, solved." to={3.2} /></Scene>
      </Series.Sequence>

      {/* SCHEDULE: a table on a sheet, five rows light up */}
      <Series.Sequence durationInFrames={seq("schedA")}>
        <Scene name="schedule" from={11.4} rate={4} keys={[{ at: 0, x: .5, y: .5, s: 1 }, { at: .3, x: .99, y: .98, s: 1.7 }, { at: 1.4, x: .99, y: .98, s: 1.7 }]}>
          <Pop text="Schedules?" to={1.35} />
        </Scene>
      </Series.Sequence>
      <Series.Sequence durationInFrames={seq("schedB")}>
        <Scene name="schedule" from={17} rate={2.5} keys={[{ at: 0, x: .99, y: .45, s: 1.5 }, { at: 1.8, x: .99, y: .45, s: 1.5 }]}>
          <Pop text="It reads the table." to={1.75} />
        </Scene>
      </Series.Sequence>
      <Series.Sequence durationInFrames={seq("schedC")}>
        <Scene name="schedule" from={22} rate={1}><Pop text="5 doors. 5 rows." to={3.4} sub="note C · card reader" /></Scene>
      </Series.Sequence>

      <Series.Sequence durationInFrames={seq("versus")}><Versus /></Series.Sequence>
      <Series.Sequence durationInFrames={seq("numbers")}><NumbersScene /></Series.Sequence>
      <Series.Sequence durationInFrames={seq("close")}>
        <Title big="Ask. Check. Trust." line="Exact where the file allows. A detector for scans. A language model last." small="SiteLens · Junction 2026" bigSize={170} />
      </Series.Sequence>
    </Series>
  </AbsoluteFill>
);
