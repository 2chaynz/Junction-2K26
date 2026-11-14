import { useState, type KeyboardEvent, type ReactNode } from "react";
import "./flow.css";

// Same look as docs/architecture.svg (boxes, cubes, arrows), redrawn so every part can be hovered and clicked.
const INK = "#1f1f24", GREY = "#6b6b75", LIGHT = "#f2f2f4", RED = "#d92d20";
type Tone = [string, string, string]; // front, top, side of a cube
const TONE: Record<string, Tone> = {
  bim: ["#7b6cf0", "#a79df7", "#5a4bd1"],
  cad: ["#f59a6b", "#f9bf9e", "#d97a4c"],
  sched: ["#4f9bd9", "#8fc0ea", "#2f78b5"],
  scan: ["#f06b6b", "#f7a1a1", "#cf4a4a"],
  other: ["#8c8c96", "#b5b5bd", "#6e6e78"],
  ans: ["#3f8f6b", "#79bf9d", "#2d6e50"],
};

type Lane = {
  id: string; input: string; file: string; reader: string; sub: string; cost: string;
  title: string; reads: string; how: string; when: string; sure: string; price: string;
  img: string; caption: string; path: string; q: string;
};

const LANES: Lane[] = [
  {
    id: "bim", input: "BIM model", file: "model.ifc", reader: "Reads the model", sub: "elements + their properties",
    cost: "€0 · exact",
    title: "BIM model reader",
    reads: "IFC models exported from Revit, ArchiCAD, Tekla…",
    how: "Opens the model and reads each element's own data: room areas, wall lengths, slab volumes, doors per storey. Nothing is measured from a picture.",
    when: "Whenever the file is an IFC model. It goes first because it is exact.",
    sure: "97% of Stoa's BIM questions right. Every answer names the model elements it used.",
    price: "€0 per answer, under 2 s",
    img: "/how/bim.jpg",
    caption: "KORIDOR (119) on 1.korrus: 63.8 m² (Stoa's key: 63.84). The room lights up in the 3D model.",
    path: "data/ifc_models/bsc-esplanades_1807-ep-ar-v18.ifc",
    q: "What is the net floor area of the room 'KORIDOR (119)' on '1.korrus', in m²?",
  },
  {
    id: "cad", input: "CAD drawing", file: "plan.pdf / .dxf", reader: "Reads text + lines", sub: "room labels, area tags, outlines",
    cost: "€0 · exact",
    title: "Drawing text and geometry reader",
    reads: "PDFs exported from CAD, and DXF files",
    how: "Reads the room labels, area tags and line work exactly as the CAD file stored them, then matches each label to its room outline. Like querying the drawing's own database.",
    when: "Any PDF or DXF that still has its text layer, i.e. not a scan.",
    sure: "96% of Stoa's Swiss apartment plan questions right.",
    price: "€0 per answer, under 1 s",
    img: "/how/cad.jpg",
    caption: "Room 0.08 Küche: 7.54 m², circled on the plan with its label (Stoa's key: 7.54).",
    path: "data/swiss_dwellings/site418_bldg1080_floor4724.pdf",
    q: "What is the net floor area of room 0.08 ('Küche') in m²?",
  },
  {
    id: "sched", input: "Schedule sheet", file: "door / finish tables", reader: "Reads the schedule", sub: "rebuilds the table, counts rows",
    cost: "€0 – €0.005",
    title: "Schedule reader",
    reads: "Door, window and finish schedules printed on sheets",
    how: "Rebuilds the table from the sheet's text, then counts or sums the matching rows. Every row it used is marked on the sheet, so you can tick them off.",
    when: "Questions about doors, finishes or rooms that a schedule lists.",
    sure: "Exact when the table reads cleanly. An AI step only interprets column names, never invents rows.",
    price: "€0, or about €0.005 when the AI step is needed",
    img: "/how/schedule.jpg",
    caption: "Sheet A-801: 14 doors of type A1, all 14 rows marked (Stoa's key: 14).",
    path: "data/opening_design/Sports_Complex/Sheets - Current Set/A-801 - Door and Finish Schedules & Wall Types.pdf",
    q: "On sheet A-801 of the Xcel Sports Complex drawings, how many doors in the door schedule are door type A1 (swing door)?",
  },
  {
    id: "scan", input: "Scanned plan", file: "scan.png / .jpg", reader: "Spots symbols", sub: "doors, windows, WCs, sinks",
    cost: "€0.00001 · laptop",
    title: "Symbol spotter",
    reads: "Scanned or photographed plans with no text layer",
    how: "A model trained on about 5,000 public Finnish floor plans boxes every door, window, WC, sink and shower, the way you'd count them with a highlighter. Room names are read too.",
    when: "When the drawing is an image: scans, photos, old sheets.",
    sure: "Right about 9 times in 10 when it's confident. Otherwise it says 'please check' and draws doubtful boxes dashed.",
    price: "€0.00001 per answer, runs on a laptop",
    img: "/how/scan.jpg",
    caption: "Plan colorful-2002: 2 sinks, each boxed in red (Stoa's key: 2).",
    path: "data/cubicasa5k/colorful-2002.png",
    q: "How many sinks and wash basins (kitchen and bathroom combined; a double-bowl sink counts as one) are drawn on this floor plan?",
  },
  {
    id: "other", input: "Anything else", file: "any sheet, any question", reader: "AI, last resort", sub: "facts first, then vision AI",
    cost: "≈ €0.001 – 0.014",
    title: "AI on the facts, vision AI last",
    reads: "Free-form questions none of the exact readers handle",
    how: "First an AI answers from the facts the readers already pulled out of the drawing (rooms, apartments, symbols) and must cite them. Only if that fails does a vision AI look at the relevant part of the sheet.",
    when: "Questions like 'Which apartment has the most bedrooms?', or anything unusual.",
    sure: "Least certain of all. Always shows what it used, and says 'please check' when unsure.",
    price: "about €0.001 – 0.014 per answer",
    img: "/how/other.jpg",
    caption: "'Which apartment has the most bedrooms?' Apartment C: its 3 bedrooms circled on the plan.",
    path: "data/swiss_dwellings/site418_bldg1080_floor4724.pdf",
    q: "Which apartment has the most bedrooms?",
  },
];

type Info = { title: string; body: ReactNode };
const BOXES: Record<string, Info> = {
  question: {
    title: "Your question",
    body: <p>Ask in your own words, in any language. A question in Finnish or German goes to the same readers as in English. Vague questions get a question back ("Which floor?") instead of a guess.</p>,
  },
  dispatcher: {
    title: "Dispatcher",
    body: (
      <>
        <p>Plain rules, no AI, costs nothing. It hands the question to each reader in order: the exact, free ones first, AI last.</p>
        <p>A reader that can't answer says so and passes it on. The first one that can answer wins, so a cheap exact answer is never replaced by a costly guess.</p>
      </>
    ),
  },
  answer: {
    title: "What you get",
    body: (
      <dl className="fl-facts">
        <dt>The number</dt><dd>with its unit: 63.8 m², 14 doors…</dd>
        <dt>Where</dt><dd>red marks on the drawing (or the element in the 3D model), numbered so you can check each one</dd>
        <dt>How</dt><dd>the steps it took, in plain words</dd>
        <dt>Cost</dt><dd>what this answer cost, usually €0</dd>
        <dt>How sure</dt><dd>'please check' when it isn't</dd>
      </dl>
    ),
  },
  screen: {
    title: "On your screen",
    body: <p>The plan opens with the marks on it, the chat shows the reasoning step by step. A wrong answer is visible at a glance.</p>,
  },
  scorer: {
    title: "How we test it",
    body: <p>Every reader is scored against Stoa's 7,990 questions with known answers: counts must be exact, areas, lengths and volumes within 2%. Scores are reported on drawings we never tuned on.</p>,
  },
  training: {
    title: "How the symbol spotter was trained",
    body: <p>About 5,000 public Finnish floor plans (CubiCasa5K) with every symbol labelled. Any plan that also appears in Stoa's set was removed first, so the test is fair. Trained once on a rented GPU for about €4.</p>,
  },
};

// Geometry, in viewBox units.
const ROW0 = 150, ROWH = 120, BOXH = 72;
const rowY = (i: number) => ROW0 + i * ROWH;
const DISP = { x: 322, w: 64, y: 108, h: 4 * ROWH + BOXH + 12 };
const READ = { x: 452, w: 236 };
const ANS = { x: 830, y: 238, w: 230, h: 330 };

function Cube({ x, y, tone, s = 22 }: { x: number; y: number; tone: Tone; s?: number }) {
  const o = s * 0.32;
  return (
    <g>
      <path d={`M${x},${y} l${o},${-o} h${s} l${-o},${o} z`} fill={tone[1]} />
      <path d={`M${x + s},${y} l${o},${-o} v${s} l${-o},${o} z`} fill={tone[2]} />
      <rect x={x} y={y} width={s} height={s} fill={tone[0]} />
    </g>
  );
}

function Icon({ id, x, y }: { id: string; x: number; y: number }) {
  const g = (c: ReactNode) => <g transform={`translate(${x} ${y})`} stroke={INK} strokeWidth={2}>{c}</g>;
  if (id === "bim")
    return g(<>
      <path d="M45,4 L84,22 L84,58 L45,76 L6,58 L6,22 Z" fill="#ece9fd" />
      <path d="M6,22 L45,40 L84,22 M45,40 V76" fill="none" />
      <path d="M6,40 L45,58 L84,40" fill="none" strokeDasharray="4 3" strokeWidth={1.5} />
    </>);
  if (id === "cad")
    return g(<>
      <rect x={4} y={6} width={84} height={68} fill="white" />
      <path d="M46,6 V44 M4,44 H88 M60,44 V74" fill="none" />
      <text x={24} y={26} fontSize={8} stroke="none" fill={INK} textAnchor="middle">Zimmer</text>
      <text x={24} y={36} fontSize={7} stroke="none" fill={INK} textAnchor="middle">15.90 m²</text>
      <text x={67} y={28} fontSize={8} stroke="none" fill={INK} textAnchor="middle">Küche</text>
    </>);
  if (id === "sched")
    return g(<>
      <rect x={4} y={8} width={84} height={64} fill="white" />
      <rect x={4} y={8} width={84} height={12} fill="#dcebf8" />
      <path d="M4,32 H88 M4,44 H88 M4,56 H88 M26,8 V72 M52,8 V72" fill="none" strokeWidth={1.2} />
      <path d="M4,38 H88" stroke={RED} strokeWidth={2} />
    </>);
  if (id === "scan")
    return g(<>
      <rect x={4} y={4} width={84} height={72} fill="#e9e6df" strokeWidth={4} />
      <path d="M4,42 H48 V76 M48,4 V22" fill="none" strokeWidth={4} />
      <rect x={12} y={12} width={10} height={10} fill="none" stroke={RED} />
      <rect x={60} y={50} width={10} height={10} fill="none" stroke={RED} />
      <rect x={72} y={50} width={10} height={10} fill="none" stroke={RED} />
    </>);
  return g(<>
    <rect x={4} y={4} width={84} height={72} fill="#f5f2ea" />
    <path d="M14,24 C30,14 44,34 62,22 S80,20 82,24 M14,56 C30,46 44,64 62,52" fill="none" strokeWidth={1.5} />
    <rect x={30} y={30} width={34} height={20} fill="none" strokeDasharray="4 3" />
  </>);
}

function Arrow({ d, on, dash }: { d: string; on: boolean; dash?: boolean }) {
  return (
    <path d={d} fill="none" stroke={on ? INK : "#b9b9c0"} strokeWidth={on ? 2.5 : 2}
      strokeDasharray={dash ? "7 6" : undefined} markerEnd={on ? "url(#fl-head)" : "url(#fl-head-dim)"} />
  );
}

function Box({ x, y, w, h, title, sub, id, sel, onPick, dash, bold }: {
  x: number; y: number; w: number; h: number; title: string; sub?: string; id: string; sel: string | null;
  onPick: (id: string) => void; dash?: boolean; bold?: boolean;
}) {
  return (
    <g className={`fl-hit ${sel === id ? "on" : ""}`} {...hit(id, onPick)}>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={dash ? "#fafafa" : LIGHT}
        stroke={sel === id ? RED : dash ? GREY : INK} strokeWidth={bold ? 3.5 : 2.5} strokeDasharray={dash ? "9 7" : undefined} />
      <text x={x + w / 2} y={y + h / 2 + (sub ? -6 : 7)} textAnchor="middle" fontSize={22}>{title}</text>
      {sub && <text x={x + w / 2} y={y + h / 2 + 20} textAnchor="middle" fontSize={16} fill={GREY}>{sub}</text>}
    </g>
  );
}

function hit(id: string, onPick: (id: string) => void) {
  return {
    role: "button", tabIndex: 0, "aria-label": id,
    onClick: () => onPick(id),
    onKeyDown: (e: KeyboardEvent) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onPick(id)),
  };
}

export default function Flow() {
  const [hover, setHover] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [built, setBuilt] = useState(false);
  const pick = (id: string) => setSel((s) => (s === id ? null : id));
  const lit = (id: string) => hover === null || hover === id;
  const H = built ? 870 : 750;
  const lane = LANES.find((l) => l.id === sel);
  const info = sel ? BOXES[sel] : undefined;

  return (
    <div className="flow">
      <div className="fl-canvas">
        <div className="fl-bar">
          <span className="dim small">Hover a row to follow a drawing type · click any box for what it does on a real drawing</span>
          <label className="fl-toggle">
            <input type="checkbox" checked={built} onChange={(e) => setBuilt(e.target.checked)} /> Show how we built and tested it
          </label>
        </div>
        <svg viewBox={`0 0 1240 ${H}`} className="fl-svg" fontFamily="Georgia, 'Times New Roman', serif">
          <defs>
            <marker id="fl-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={INK} />
            </marker>
            <marker id="fl-head-dim" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#b9b9c0" />
            </marker>
          </defs>

          {/* Question → dispatcher */}
          <Box x={DISP.x - 78} y={12} w={220} h={62} title="Your question" sub="any language" id="question" sel={sel} onPick={pick} />
          <Arrow d={`M${DISP.x + DISP.w / 2},74 V${DISP.y - 4}`} on />

          {/* Dispatcher bar */}
          <g className={`fl-hit ${sel === "dispatcher" ? "on" : ""}`} {...hit("dispatcher", pick)}>
            <rect x={DISP.x} y={DISP.y} width={DISP.w} height={DISP.h} rx={8} fill={LIGHT}
              stroke={sel === "dispatcher" ? RED : INK} strokeWidth={3.5} />
            <text transform={`translate(${DISP.x + 30} ${DISP.y + DISP.h / 2}) rotate(-90)`} textAnchor="middle" fontSize={30}>Dispatcher</text>
            <text transform={`translate(${DISP.x + 52} ${DISP.y + DISP.h / 2}) rotate(-90)`} textAnchor="middle" fontSize={16} fill={GREY} fontStyle="italic">
              plain rules · exact readers first · €0
            </text>
          </g>

          {LANES.map((l, i) => {
            const y = rowY(i), cy = y + BOXH / 2, on = lit(l.id), t = TONE[l.id];
            return (
              <g key={l.id} className={`fl-lane ${on ? "" : "dim"}`}
                onMouseEnter={() => setHover(l.id)} onMouseLeave={() => setHover(null)}>
                {/* Drawing type */}
                <g className={`fl-hit ${sel === l.id ? "on" : ""}`} {...hit(l.id, pick)}>
                  <rect className="fl-ghost" x={16} y={y - 14} width={262} height={BOXH + 28} fill="transparent" />
                  <Icon id={l.id} x={22} y={y - 4} />
                  <text x={120} y={cy - 2} fontSize={21}>{l.input}</text>
                  <text x={120} y={cy + 20} fontSize={15} fill={GREY}>{l.file}</text>
                </g>
                <Arrow d={`M${276},${cy} H${DISP.x - 4}`} on={on} />
                <Arrow d={`M${DISP.x + DISP.w},${cy} H${READ.x - 4}`} on={on} />
                {/* Reader */}
                <g className={`fl-hit ${sel === l.id ? "on" : ""}`} {...hit(l.id, pick)}>
                  <rect x={READ.x} y={y} width={READ.w} height={BOXH} rx={8} fill={LIGHT}
                    stroke={sel === l.id ? RED : INK} strokeWidth={2.5} />
                  <circle cx={READ.x} cy={y} r={13} fill="white" stroke={INK} strokeWidth={2} />
                  <text x={READ.x} y={y + 6} textAnchor="middle" fontSize={16}>{i + 1}</text>
                  <text x={READ.x + READ.w / 2} y={cy - 5} textAnchor="middle" fontSize={22}>{l.reader}</text>
                  <text x={READ.x + READ.w / 2} y={cy + 20} textAnchor="middle" fontSize={15} fill={GREY}>{l.sub}</text>
                </g>
                <text x={READ.x + READ.w} y={y + BOXH + 22} textAnchor="end" fontSize={16} fill={GREY} fontStyle="italic">{l.cost}</text>
                {i < LANES.length - 1 && (
                  <text x={DISP.x + DISP.w + 10} y={y + BOXH + 38} fontSize={14} fill={GREY} fontStyle="italic">can't answer → next reader</text>
                )}
                {/* Result cubes → answer */}
                <Arrow d={`M${READ.x + READ.w},${cy} H${704}`} on={on} />
                <Cube x={708} y={cy - 22} tone={TONE.ans} />
                <Cube x={736} y={cy - 22} tone={t} />
                <Cube x={736} y={cy + 4} tone={t} />
                <Arrow d={`M${770},${cy} C${800},${cy} ${800},${ANS.y + ANS.h / 2} ${ANS.x - 4},${ANS.y + ANS.h / 2}`} on={on} />
              </g>
            );
          })}

          {/* Answer card */}
          <g className={`fl-hit ${sel === "answer" ? "on" : ""}`} {...hit("answer", pick)}>
            <rect x={ANS.x} y={ANS.y} width={ANS.w} height={ANS.h} rx={8} fill="white"
              stroke={sel === "answer" ? RED : INK} strokeWidth={3.5} />
            <text x={ANS.x + ANS.w / 2} y={ANS.y + 40} textAnchor="middle" fontSize={28}>Answer</text>
            {[["the number", "63.8 m²"], ["where", "marked in red"], ["how", "steps"], ["cost", "€0"], ["how sure", "95%"]].map(([k, v], j) => (
              <g key={k}>
                <text x={ANS.x + 22} y={ANS.y + 90 + j * 50} fontSize={18} fontWeight={700}>{k}</text>
                <text x={ANS.x + ANS.w - 22} y={ANS.y + 90 + j * 50} fontSize={17} textAnchor="end" fill={j === 1 ? RED : GREY}>{v}</text>
              </g>
            ))}
          </g>
          <text x={ANS.x + ANS.w / 2} y={ANS.y - 14} textAnchor="middle" fontSize={16} fill={GREY} fontStyle="italic">first reader that answers wins</text>

          {/* On screen */}
          <Arrow d={`M${ANS.x + ANS.w},${ANS.y + 70} H1090`} on dash />
          <Box x={1094} y={ANS.y + 10} w={136} h={120} title="On screen" sub="marks + steps" id="screen" sel={sel} onPick={pick} dash />

          {built && (
            <>
              <Arrow d={`M${ANS.x + ANS.w},${ANS.y + ANS.h - 60} H1090`} on dash />
              <Box x={1094} y={ANS.y + ANS.h - 120} w={136} h={120} title="Tested" sub="vs 7,990 answers" id="scorer" sel={sel} onPick={pick} dash />
              <g className={`fl-hit ${sel === "training" ? "on" : ""}`} {...hit("training", pick)}>
                <rect x={150} y={770} width={720} height={84} rx={8} fill="#fafafa" stroke={sel === "training" ? RED : GREY} strokeWidth={2} strokeDasharray="9 7" />
                {[["Public Finnish plans", "≈5k, every symbol labelled"], ["Remove every Stoa plan", "keeps the test fair"], ["Train the spotter", "rented GPU, ≈ €4"]].map(([a, b], j) => (
                  <g key={a}>
                    <rect x={170 + j * 236} y={786} width={204} height={54} rx={8} fill={LIGHT} stroke={INK} strokeWidth={2} />
                    <text x={272 + j * 236} y={808} textAnchor="middle" fontSize={17}>{a}</text>
                    <text x={272 + j * 236} y={828} textAnchor="middle" fontSize={14} fill={GREY}>{b}</text>
                    {j < 2 && <Arrow d={`M${374 + j * 236},813 H${402 + j * 236}`} on />}
                  </g>
                ))}
              </g>
              <Arrow d={`M800,770 V${rowY(3) + BOXH / 2 + 30} H${READ.x + READ.w + 4}`} on dash />
            </>
          )}

          {/* Legend */}
          <g transform="translate(830 640)" fontSize={15}>
            <Cube x={0} y={-12} tone={TONE.ans} s={16} />
            <text x={26} y={0}>the value</text>
            <Cube x={110} y={-12} tone={TONE.scan} s={16} />
            <text x={136} y={0}>where it is on the drawing</text>
          </g>
        </svg>
      </div>

      <aside className="fl-panel" aria-live="polite">
        {lane ? (
          <>
            <div className="fl-kicker mono">Reader {LANES.indexOf(lane) + 1} of 5</div>
            <h3>{lane.title}</h3>
            <dl className="fl-facts">
              <dt>Reads</dt><dd>{lane.reads}</dd>
              <dt>How</dt><dd>{lane.how}</dd>
              <dt>Used when</dt><dd>{lane.when}</dd>
              <dt>How sure</dt><dd>{lane.sure}</dd>
              <dt>Cost</dt><dd>{lane.price}</dd>
            </dl>
            <figure className="fl-example">
              <img src={lane.img} alt={lane.caption} loading="lazy" />
              <figcaption className="small">{lane.caption}</figcaption>
            </figure>
            <a className="fl-try" href={`/?${new URLSearchParams({ path: lane.path, q: lane.q })}`}>Try it on a real drawing →</a>
          </>
        ) : info ? (
          <>
            <h3>{info.title}</h3>
            <div className="fl-body">{info.body}</div>
          </>
        ) : (
          <>
            <h3>In three steps</h3>
            <ol className="fl-steps">
              <li><b>You ask</b> about a drawing or BIM model, in your words.</li>
              <li><b>The exact readers try first.</b> They read the file's own data: model properties, text, lines, symbols. AI only steps in when none of them can answer.</li>
              <li><b>You get the answer</b> with the spot marked on the drawing, the steps it took and what it cost.</li>
            </ol>
            <p className="dim small">Click a row or any box to see what it does on a real drawing.</p>
          </>
        )}
      </aside>
    </div>
  );
}
