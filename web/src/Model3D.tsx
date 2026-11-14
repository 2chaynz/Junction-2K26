/// <reference types="vite/client" />
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  IFCBUILDINGSTOREY, IFCCOVERING, IFCCURTAINWALL, IFCDOOR, IFCDOORSTANDARDCASE, IFCRELAGGREGATES,
  IFCRELCONTAINEDINSPATIALSTRUCTURE, IFCROOF, IFCSLAB, IFCSPACE, IFCWALL, IFCWALLSTANDARDCASE, IFCWINDOW,
  IFCWINDOWSTANDARDCASE, IfcAPI, type FlatMesh,
} from "web-ifc";
import wasmUrl from "web-ifc/web-ifc.wasm?url";
import "./model3d.css";
import type { Answer } from "./types";
import { levelLabel } from "./Takeoff";

type Props = {
  path: string;
  answer: Answer | null;
  hover: number | null;
  focus: number | null;
  onHover: (i: number | null) => void;
  onFocus: (i: number | null) => void;
  busy: boolean;
  language?: string;
  demo?: { url: string; baseline: string; overview: boolean; removedIds: ReadonlySet<string>; onReady: (ready: boolean) => void };
};

type Cat = "walls" | "doors" | "windows" | "slabs" | "spaces" | "other";
const CATS: Cat[] = ["walls", "doors", "windows", "slabs", "spaces", "other"];
const CAT_OF: Record<number, Cat> = {
  [IFCWALL]: "walls", [IFCWALLSTANDARDCASE]: "walls", [IFCCURTAINWALL]: "walls",
  [IFCDOOR]: "doors", [IFCDOORSTANDARDCASE]: "doors",
  [IFCWINDOW]: "windows", [IFCWINDOWSTANDARDCASE]: "windows",
  [IFCSLAB]: "slabs", [IFCROOF]: "slabs", [IFCCOVERING]: "slabs",
  [IFCSPACE]: "spaces",
};

type Elem = {
  id: number; guid: string; type: number; cat: Cat; storey: number | null;
  meshes: THREE.Mesh[]; base: THREE.Material[]; box: THREE.Box3;
};
type Storey = { id: number; name: string; base: number; cut: number; count: number };
type Model = { id: number; elems: Map<string, Elem>; storeys: Storey[]; box: THREE.Box3 };
type Info = { title: string; rows: [string, string][] };

const FLOOR_LABELS = {
  en: { floors: "Floors", all: "All", level: "Floor", roof: "Roof", foundation: "Foundation" },
  et: { floors: "Korrused", all: "Kõik", level: "Korrus", roof: "Katus", foundation: "Vundament" },
  fi: { floors: "Kerrokset", all: "Kaikki", level: "Kerros", roof: "Katto", foundation: "Perustus" },
  da: { floors: "Etager", all: "Alle", level: "Etage", roof: "Tag", foundation: "Fundament" },
  de: { floors: "Geschosse", all: "Alle", level: "Geschoss", roof: "Dach", foundation: "Fundament" },
  fr: { floors: "Étages", all: "Tous", level: "Étage", roof: "Toit", foundation: "Fondation" },
  uk: { floors: "Поверхи", all: "Усі", level: "Поверх", roof: "Дах", foundation: "Фундамент" },
};

let api: Promise<IfcAPI> | null = null;
function ifcApi() {
  api ??= (async () => {
    const a = new IfcAPI();
    await a.Init((p) => (p.endsWith(".wasm") ? wasmUrl : p), true);
    return a;
  })();
  return api;
}

const RED = new THREE.Color("#d92d20");
// polygonOffset: coplanar faces (door in its wall, covering on its slab) z-fight and flicker;
// pushing slabs back and marks forward gives every pixel a stable winner.
const back = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 };
const front = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 };
const ds = { side: THREE.DoubleSide };
const mats = {
  opaque: new THREE.MeshLambertMaterial({ vertexColors: true, ...ds }),
  opaqueBack: new THREE.MeshLambertMaterial({ vertexColors: true, ...ds, ...back }),
  glass: new THREE.MeshLambertMaterial({ vertexColors: true, ...ds, transparent: true, opacity: 0.35, depthWrite: false }),
  ghost: new THREE.MeshLambertMaterial({ color: "#8a8f98", ...ds, transparent: true, opacity: 0.07, depthWrite: false }),
  space: new THREE.MeshLambertMaterial({ color: "#5b7bb5", ...ds, ...back, transparent: true, opacity: 0.12, depthWrite: false }),
  planWall: new THREE.MeshBasicMaterial({ color: "#2b2b2b", ...ds }),
  planFloor: new THREE.MeshBasicMaterial({ color: "#ffffff", ...ds, ...back }),
  planThin: new THREE.MeshBasicMaterial({ color: "#9a9a9a", ...ds }),
  mark: new THREE.MeshLambertMaterial({ color: RED, emissive: RED, emissiveIntensity: 0.25, ...ds, ...front }),
  added: new THREE.MeshLambertMaterial({ color: "#24d6aa", emissive: "#07906e", emissiveIntensity: 0.38, ...ds, ...front }),
  removed: new THREE.MeshLambertMaterial({ color: "#ff736a", emissive: "#e24e43", emissiveIntensity: 0.32, ...ds, ...front, transparent: true, opacity: 0.7, depthWrite: false }),
  hot: new THREE.MeshLambertMaterial({ color: RED, emissive: RED, emissiveIntensity: 0.8, ...ds, ...front }),
  room: new THREE.MeshLambertMaterial({ color: RED, emissive: RED, emissiveIntensity: 0.2, ...ds, ...front, transparent: true, opacity: 0.3, depthWrite: false }),
  roomHot: new THREE.MeshLambertMaterial({ color: RED, emissive: RED, emissiveIntensity: 0.6, ...ds, ...front, transparent: true, opacity: 0.55, depthWrite: false }),
};

// Everything but the marks is cut at plan height in 2D; marks stay whole so their footprint reads in red.
const CLIPPED = [mats.opaque, mats.opaqueBack, mats.glass, mats.ghost, mats.space, mats.planWall, mats.planFloor, mats.planThin];

// Interleaved [x y z nx ny nz] from web-ifc → BufferGeometry in world coords with a flat colour.
function toGeometry(v: Float32Array, idx: Uint32Array, m: number[], c: { x: number; y: number; z: number }) {
  const n = v.length / 6;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos.set(v.subarray(i * 6, i * 6 + 3), i * 3);
    nor.set(v.subarray(i * 6 + 3, i * 6 + 6), i * 3);
    col[i * 3] = c.x; col[i * 3 + 1] = c.y; col[i * 3 + 2] = c.z;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx.slice(), 1));
  g.applyMatrix4(new THREE.Matrix4().fromArray(m));
  return g;
}

const ids = (v: { size(): number; get(i: number): number }) => Array.from({ length: v.size() }, (_, i) => v.get(i));
const refs = (x: unknown): number[] => (Array.isArray(x) ? x : x ? [x] : []).map((h: { value: number }) => h?.value).filter(Boolean);

// Element expressID → storey expressID, via containment and aggregation (spaces, stair flights…).
function storeyMap(a: IfcAPI, id: number, storeys: Set<number>) {
  const of = new Map<number, number>();
  const pairs: [number, number[]][] = [];
  for (const r of ids(a.GetLineIDsWithType(id, IFCRELCONTAINEDINSPATIALSTRUCTURE))) {
    const l = a.GetLine(id, r);
    pairs.push([l.RelatingStructure?.value, refs(l.RelatedElements)]);
  }
  for (const r of ids(a.GetLineIDsWithType(id, IFCRELAGGREGATES))) {
    const l = a.GetLine(id, r);
    pairs.push([l.RelatingObject?.value, refs(l.RelatedObjects)]);
  }
  for (let pass = 0; pass < 4; pass++)
    for (const [parent, kids] of pairs) {
      const s = storeys.has(parent) ? parent : of.get(parent);
      if (s !== undefined) kids.forEach((k) => !storeys.has(k) && !of.has(k) && of.set(k, s));
    }
  return of;
}

const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;
};

const ifcBytes = new Map<string, { until: number; data: Promise<ArrayBuffer> }>();
async function readIfc(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`ifc: ${response.status}`);
  return response.arrayBuffer();
}

function fetchSampleIfc(url: string) {
  const hit = ifcBytes.get(url);
  if (hit && hit.until > Date.now()) {
    ifcBytes.delete(url);
    ifcBytes.set(url, hit);
    return hit.data;
  }
  const data = readIfc(url).catch((error) => {
    if (ifcBytes.get(url)?.data === data) ifcBytes.delete(url);
    throw error;
  });
  ifcBytes.delete(url);
  ifcBytes.set(url, { data, until: Date.now() + 300_000 });
  if (ifcBytes.size > 2) ifcBytes.delete(ifcBytes.keys().next().value!);
  return data;
}

async function load(url: string, root: THREE.Group, alive: () => boolean, sample: boolean, only?: ReadonlySet<string>): Promise<Model | null> {
  const [a, buf] = await Promise.all([ifcApi(), sample ? fetchSampleIfc(url) : readIfc(url)]);
  await new Promise((r) => setTimeout(r, 30)); // let "Loading" paint: streaming blocks the thread
  if (!alive()) return null;
  const id = a.OpenModel(new Uint8Array(buf), { COORDINATE_TO_ORIGIN: !sample });
  const storeyIds = ids(a.GetLineIDsWithType(id, IFCBUILDINGSTOREY));
  const storeyOf = storeyMap(a, id, new Set(storeyIds));
  const elems = new Map<string, Elem>();
  const onMesh = (fm: FlatMesh) => {
    const line = a.GetLine(id, fm.expressID);
    const guid: string | undefined = line?.GlobalId?.value;
    if (!guid || elems.has(guid) || (only && !only.has(guid))) return;
    const solid: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [];
    for (let k = 0; k < fm.geometries.size(); k++) {
      const pg = fm.geometries.get(k);
      const geo = a.GetGeometry(id, pg.geometryExpressID);
      const v = a.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize());
      const idx = a.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize());
      if (idx.length) (pg.color.w < 0.99 ? glass : solid).push(toGeometry(v, idx, pg.flatTransformation, pg.color));
      geo.delete();
    }
    if (!(solid.length || glass.length)) return;
    const cat = CAT_OF[line.type] ?? "other";
    const e: Elem = {
      id: fm.expressID, guid, type: line.type, cat, storey: storeyOf.get(fm.expressID) ?? null,
      meshes: [], base: [], box: new THREE.Box3(),
    };
    for (const [parts, mat] of [[solid, cat === "slabs" ? mats.opaqueBack : mats.opaque], [glass, mats.glass]] as const) {
      if (!parts.length) continue;
      const g = parts.length === 1 ? parts[0] : mergeGeometries(parts)!;
      parts.forEach((p) => p !== g && p.dispose());
      g.computeBoundingBox();
      e.box.union(g.boundingBox!);
      const mesh = new THREE.Mesh(g, mat);
      mesh.userData.guid = guid;
      e.meshes.push(mesh);
      e.base.push(mat);
      root.add(mesh);
    }
    elems.set(guid, e);
  };
  try {
    a.StreamAllMeshes(id, onMesh);
    // web-ifc skips spaces by default; room answers cite them, so stream them too.
    a.StreamAllMeshesWithTypes(id, [IFCSPACE], onMesh);
  } catch (e) {
    a.CloseModel(id);
    throw e;
  }

  // Storey floor level from geometry (Elevation is in model units and often stale):
  // where its walls and spaces start. Plan cut 1.2 m above, like a drawn floor plan.
  const by = new Map<number, Elem[]>();
  elems.forEach((e) => e.storey !== null && by.set(e.storey, [...(by.get(e.storey) ?? []), e]));
  const storeys: Storey[] = storeyIds
    .filter((s) => by.has(s))
    .map((s) => {
      const es = by.get(s)!;
      const starts = es.filter((e) => e.cat === "walls" || e.cat === "spaces").map((e) => e.box.min.y);
      const base = quantile(starts.length ? starts : es.map((e) => e.box.min.y), 0.2);
      return { id: s, name: a.GetLine(id, s).Name?.value || `Storey #${s}`, base, cut: base + 1.2, count: es.length };
    })
    .sort((x, y) => y.base - x.base);
  const box = new THREE.Box3();
  elems.forEach((e) => e.cat !== "spaces" && box.union(e.box));
  return { id, elems, storeys, box };
}

// Name, storey and the quantities / properties a human checks an answer against.
async function info(a: IfcAPI, m: Model, e: Elem): Promise<Info | null> {
  let l;
  try {
    l = a.GetLine(m.id, e.id);
  } catch {
    return null; // model closed meanwhile (file switched)
  }
  const rows: [string, string][] = [];
  const st = m.storeys.find((s) => s.id === e.storey);
  if (l.Name?.value) rows.push(["Name", String(l.Name.value)]);
  if (l.LongName?.value) rows.push(["Long name", String(l.LongName.value)]);
  if (st) rows.push(["Storey", st.name]);
  rows.push(["GUID", e.guid]);
  try {
    const sets = await a.properties.getPropertySets(m.id, e.id, true);
    for (const s of sets) {
      for (const q of s.Quantities ?? []) {
        const v = q.AreaValue ?? q.LengthValue ?? q.VolumeValue ?? q.CountValue ?? q.WeightValue;
        if (v?.value !== undefined) rows.push([q.Name?.value ?? "?", fmt(v.value)]);
      }
      for (const p of s.HasProperties ?? []) {
        const v = p.NominalValue?.value;
        if (v !== undefined && v !== null && String(v).trim() && String(v).length < 40) rows.push([p.Name?.value ?? "?", fmt(v)]);
      }
    }
  } catch {
    // property sets are a bonus; the element itself is already identified
  }
  return { title: a.GetNameFromTypeCode(e.type) || "Element", rows: rows.slice(0, 18) };
}
const fmt = (v: unknown) => (typeof v === "number" ? String(Math.round(v * 1000) / 1000) : String(v));

export default function Model3D({ path, answer, hover, focus, onHover, onFocus, busy, demo, language }: Props) {
  const locale = (language ?? navigator.language).split("-")[0] as keyof typeof FLOOR_LABELS;
  const floorLabels = FLOOR_LABELS[locale] ?? FLOOR_LABELS.en;
  const host = useRef<HTMLDivElement>(null);
  const tags = useRef<HTMLDivElement>(null);
  const three = useRef<{
    renderer: THREE.WebGLRenderer; persp: THREE.PerspectiveCamera; ortho: THREE.OrthographicCamera;
    orbit: OrbitControls; pan: OrbitControls; root: THREE.Group; sweep: THREE.Mesh; cut: THREE.Plane;
    flat: boolean; half: number; fly: ((t: number) => void) | null; resize: () => void;
  } | null>(null);
  const [model, setModel] = useState<Model | null>(null);
  const [status, setStatus] = useState("");
  const [floor, setFloor] = useState<number | null>(null); // storey expressID, null = whole building
  const [flat, setFlat] = useState(false); // 2D plan of the floor
  const [off, setOff] = useState<Set<Cat>>(new Set(["spaces"]));
  const [picked, setPicked] = useState<Info | null>(null);
  const modelUrl = demo?.url ?? `/api/ifc?path=${encodeURIComponent(path)}`;
  const onReady = demo?.onReady;
  const baseline = demo?.baseline;
  const removedIds = demo?.removedIds;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const elems = model?.elems ?? null;

  // evidence index → element, only for evidence that names a GUID in this model.
  const cited = useMemo(() => {
    const m = new Map<number, Elem>();
    if (!answer || !elems) return m;
    answer.evidence.forEach((e, i) => {
      const el = e.ifc_guid ? elems.get(e.ifc_guid) : undefined;
      if (el) m.set(i, el);
    });
    return m;
  }, [answer, elems]);
  const citedRef = useRef(cited);
  citedRef.current = cited;
  const marksOn = useMemo(() => {
    const n = new Map<number, number>();
    cited.forEach((e) => e.storey !== null && n.set(e.storey, (n.get(e.storey) ?? 0) + 1));
    return n;
  }, [cited, demo?.overview]);
  const storey = model?.storeys.find((s) => s.id === floor) ?? null;

  // Scene, renderer and loop live as long as the component.
  useEffect(() => {
    const el = host.current!;
    // Log depth: tall models with a small near plane otherwise lose depth precision and flicker.
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.localClippingEnabled = true;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight("#ffffff", "#b8b8b0", 2.2));
    const sun = new THREE.DirectionalLight("#ffffff", 1.4);
    sun.position.set(1, 2, 1.5);
    scene.add(sun);
    const persp = new THREE.PerspectiveCamera(40, 1, 0.05, 5000);
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 5000);
    const orbit = new OrbitControls(persp, renderer.domElement);
    orbit.enableDamping = true;
    const pan = new OrbitControls(ortho, renderer.domElement);
    pan.enableRotate = false;
    pan.screenSpacePanning = true;
    pan.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    pan.enabled = false;
    const root = new THREE.Group();
    scene.add(root);
    const sweep = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }),
    );
    sweep.visible = false;
    scene.add(sweep);

    const s = {
      renderer, persp, ortho, orbit, pan, root, sweep, cut: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
      flat: false, half: 10, fly: null as ((t: number) => void) | null, resize: () => {},
    };
    const resize = () => {
      const w = el.clientWidth, h = Math.max(el.clientHeight, 1);
      renderer.setSize(w, h);
      persp.aspect = w / h;
      persp.updateProjectionMatrix();
      Object.assign(ortho, { left: -s.half * (w / h), right: s.half * (w / h), top: s.half, bottom: -s.half });
      ortho.updateProjectionMatrix();
    };
    s.resize = resize;
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const v = new THREE.Vector3();
    let raf = 0;
    const tick = (t: number) => {
      s.fly?.(t);
      const cam = s.flat ? ortho : persp;
      (s.flat ? pan : orbit).update();
      // Scan sweep: a red plane rising through the model while the question runs.
      const box = root.userData.box as THREE.Box3 | undefined;
      sweep.visible = busyRef.current && !!box && !s.flat;
      if (sweep.visible && box) {
        const size = box.getSize(v);
        sweep.scale.set(size.x * 1.15, 1, size.z * 1.15);
        const c = box.getCenter(new THREE.Vector3());
        sweep.position.set(c.x, box.min.y + ((t / 1600) % 1) * size.y, c.z);
      }
      renderer.render(scene, cam);
      // Number tags follow their element on screen, like the 2D margin numbers.
      const w = el.clientWidth, h = el.clientHeight;
      for (const tag of Array.from(tags.current?.children ?? []) as HTMLElement[]) {
        const e = citedRef.current.get(Number(tag.dataset.i));
        if (!e) continue;
        e.box.getCenter(v);
        v.y = s.flat ? Math.min(e.box.max.y, s.cut.constant) : e.box.max.y;
        v.project(cam);
        tag.style.display = v.z < 1 && e.meshes[0]?.visible ? "" : "none";
        tag.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    three.current = s;
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      orbit.dispose();
      pan.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      three.current = null;
    };
  }, []);

  function flyTo(box: THREE.Box3, pad: number) {
    const s = three.current;
    if (!s || box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    let start = -1;
    if (s.flat) {
      // Top view: centre on the box and zoom so it fills the frame.
      const size = box.getSize(new THREE.Vector3());
      const aspect = (s.ortho.right - s.ortho.left) / (s.ortho.top - s.ortho.bottom);
      const z1 = Math.min(s.half / Math.max(size.z * pad / 2, 0.5), (s.half * aspect) / Math.max(size.x * pad / 2, 0.5));
      const z0 = s.ortho.zoom, t0 = s.pan.target.clone(), t1 = new THREE.Vector3(c.x, s.pan.target.y, c.z);
      s.fly = (t) => {
        if (start < 0) start = t;
        const k = Math.min((t - start) / 600, 1), e = 1 - Math.pow(1 - k, 3);
        s.pan.target.lerpVectors(t0, t1, e);
        s.ortho.position.set(s.pan.target.x, s.ortho.position.y, s.pan.target.z + 0.001);
        s.ortho.zoom = z0 + (z1 - z0) * e;
        s.ortho.updateProjectionMatrix();
        if (k === 1) s.fly = null;
      };
      return;
    }
    const r = box.getBoundingSphere(new THREE.Sphere()).radius * pad;
    const dist = Math.max(r / Math.sin((s.persp.fov * Math.PI) / 360), 1.5);
    const dir = s.persp.position.clone().sub(s.orbit.target).normalize();
    if (!isFinite(dir.x) || dir.lengthSq() === 0) dir.set(1, 0.8, 1).normalize();
    const p0 = s.persp.position.clone(), t0 = s.orbit.target.clone(), p1 = c.clone().addScaledVector(dir, dist);
    s.fly = (t) => {
      if (start < 0) start = t;
      const k = Math.min((t - start) / 700, 1), e = 1 - Math.pow(1 - k, 3);
      s.persp.position.lerpVectors(p0, p1, e);
      s.orbit.target.lerpVectors(t0, c, e);
      if (k === 1) s.fly = null;
    };
  }

  // Load the model whenever the IFC file changes; keep it open for the property panel.
  useEffect(() => {
    const s = three.current!;
    let dead = false;
    const opened: Model[] = [];
    setModel(null);
    setFloor(null);
    setFlat(false);
    setPicked(null);
    clicks.current++;
    setStatus("Loading model…");
    for (const m of [...s.root.children] as THREE.Mesh[]) m.geometry.dispose();
    s.root.clear();
    s.fly = null;
    load(modelUrl, s.root, () => !dead, !!demo)
      .then(async (m) => {
        if (!m) return;
        if (dead) return (await ifcApi()).CloseModel(m.id);
        opened.push(m);
        if (baseline && removedIds) {
          const older = await load(baseline, s.root, () => !dead, true, removedIds);
          if (!older) return;
          if (dead) return (await ifcApi()).CloseModel(older.id);
          opened.push(older);
          for (const element of older.elems.values()) {
            const storey = older.storeys.find((level) => level.id === element.storey);
            element.storey = m.storeys.find((level) => level.name === storey?.name)?.id ?? null;
            element.meshes.forEach((mesh) => { mesh.visible = false; });
            m.elems.set(element.guid, element);
          }
        }
        if (m.box.isEmpty()) throw new Error("No visible geometry");
        s.root.userData.box = m.box;
        const c = m.box.getCenter(new THREE.Vector3());
        const r = m.box.getBoundingSphere(new THREE.Sphere()).radius;
        s.persp.near = Math.max(r / 2000, 0.01);
        s.persp.far = r * 20;
        s.persp.updateProjectionMatrix();
        s.orbit.target.copy(c);
        s.persp.position.copy(c).add(new THREE.Vector3(1, 0.75, 1).normalize().multiplyScalar(r * 2.2));
        s.ortho.near = 0.01;
        s.ortho.far = Math.max(r * 6, 300);
        s.half = Math.max(m.box.getSize(new THREE.Vector3()).z / 2 * 1.1, 1);
        s.resize();
        setModel(m);
        setStatus("");
      })
      .catch((e) => !dead && setStatus(`Could not load the model: ${String(e)}`));
    return () => {
      dead = true;
      if (opened.length) void ifcApi().then((a) => opened.forEach((m) => a.CloseModel(m.id)));
      for (const m of [...s.root.children] as THREE.Mesh[]) m.geometry.dispose();
      s.root.clear();
    };
  }, [modelUrl, baseline, removedIds]);

  useEffect(() => {
    const s = three.current;
    if (!s || !model || !onReady) return;
    const center = model.box.getCenter(new THREE.Vector3());
    const radius = model.box.getBoundingSphere(new THREE.Sphere()).radius;
    const wide = radius * Math.max(2.75, 2.45 / Math.max(s.persp.aspect, 0.5));
    const end = center.clone().add(new THREE.Vector3(1, 0.78, -1).normalize().multiplyScalar(wide));
    const start = center.clone().add(new THREE.Vector3(1, 0.25, -0.3).normalize().multiplyScalar(radius * 0.92));
    const detail = center.clone().add(new THREE.Vector3(radius * 0.42, radius * 0.12, 0));
    let first = -1;
    const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1800;
    s.fly = (t) => {
      if (first < 0) first = t;
      const progress = duration ? Math.min((t - first) / duration, 1) : 1;
      const ease = 1 - (1 - progress) ** 3;
      s.orbit.target.lerpVectors(detail, center, ease);
      s.persp.position.lerpVectors(start, end, ease);
      if (progress === 1) {
        s.fly = null;
        onReady(true);
      }
    };
    return () => { s.fly = null; };
  }, [model, onReady]);

  // A new answer opens the floor its elements are on (one floor → that floor; spread → whole building).
  useEffect(() => {
    if (demo?.overview) { setFloor(null); setFlat(false); return; }
    if (!cited.size) return;
    const fl = new Set([...cited.values()].map((e) => e.storey));
    const only = fl.size === 1 ? [...fl][0] : null;
    setFloor(only);
    if (only === null) setFlat(false);
  }, [cited]);

  // 2D needs a floor: take the cited one, else the floor with most elements.
  function setView(f: boolean) {
    if (f && floor === null && model?.storeys.length) {
      const best = [...model.storeys].sort((x, y) => (marksOn.get(y.id) ?? 0) - (marksOn.get(x.id) ?? 0) || y.count - x.count)[0];
      setFloor(best.id);
    }
    setFlat(f);
  }

  // Switch camera + clipping when the view or floor changes, then frame the floor.
  useEffect(() => {
    const s = three.current;
    if (!s || !model) return;
    const twoD = flat && storey !== null;
    s.flat = twoD;
    CLIPPED.forEach((m) => (m.clippingPlanes = twoD ? [s.cut] : null));
    s.orbit.enabled = !twoD;
    s.pan.enabled = twoD;
    const box = new THREE.Box3();
    model.elems.forEach((e) => e.cat !== "spaces" && (floor === null || e.storey === floor) && box.union(e.box));
    if (twoD) {
      s.cut.constant = storey!.cut;
      const c = box.getCenter(new THREE.Vector3());
      s.pan.target.set(c.x, storey!.base, c.z);
      s.ortho.position.set(c.x, storey!.cut + 50, c.z + 0.001); // straight down; OrbitControls needs the hair of offset
      s.ortho.lookAt(c.x, storey!.base, c.z);
      s.ortho.zoom = 1;
      s.ortho.updateProjectionMatrix();
    }
    if (demo && !cited.size) return;
    if (demo?.overview) return flyTo(model.box, 1.05);
    const f = focus !== null ? cited.get(focus) : undefined;
    if (f && (floor === null || f.storey === floor)) return flyTo(f.box, twoD ? 4 : 2.2);
    const marks = new THREE.Box3();
    cited.forEach((e) => (floor === null || e.storey === floor) && marks.union(e.box));
    flyTo(marks.isEmpty() ? box : marks, marks.isEmpty() ? 1.05 : demo ? 1.85 : 1.3);
  }, [model, floor, flat, cited, demo?.overview]); // eslint-disable-line react-hooks/exhaustive-deps

  // Materials + visibility: cited red, the rest normal (2D) or ghosted (3D); floor and category filters.
  useEffect(() => {
    if (!elems) return;
    const marked = new Map([...cited].map(([i, e]) => [e, answer?.evidence[i].label]));
    const any = marked.size > 0;
    const twoD = flat && floor !== null;
    const hotEl = hover !== null ? cited.get(hover) : focus !== null ? cited.get(focus) : undefined;
    elems.forEach((e) => {
      const onFloor = floor === null || e.storey === floor;
      const isMark = marked.has(e);
      const shown = onFloor && (isMark || (!off.has(e.cat) && !removedIds?.has(e.guid)));
      e.meshes.forEach((m, k) => {
        m.visible = shown;
        if (isMark) {
          const hot = e === hotEl;
          m.material = demo ? (marked.get(e)?.startsWith("Removed") ? mats.removed : mats.added) : e.cat === "spaces" ? (hot ? mats.roomHot : mats.room) : hot ? mats.hot : mats.mark;
          m.renderOrder = 2;
        } else if (twoD) {
          m.material = e.cat === "walls" ? mats.planWall : e.cat === "slabs" ? mats.planFloor
            : e.cat === "spaces" ? mats.space : e.cat === "doors" || e.cat === "windows" ? mats.planThin : e.base[k];
          m.renderOrder = 0;
        } else {
          m.material = e.cat === "spaces" ? mats.space : any ? mats.ghost : e.base[k];
          m.renderOrder = any ? 1 : 0;
        }
      });
    });
  }, [elems, cited, answer, hover, focus, floor, flat, off, removedIds]);

  // Focus from chat → fly to that element (and its floor).
  useEffect(() => {
    if (!elems || focus === null) return;
    const f = cited.get(focus);
    if (!f) return;
    if (floor !== null && f.storey !== floor) return setFloor(f.storey); // the floor effect then flies to it
    flyTo(f.box, flat ? 4 : 2.2);
  }, [focus, cited]); // eslint-disable-line react-hooks/exhaustive-deps

  // Picking: hover reacts to cited elements only (like the 2D marks); click on anything shows its properties.
  const down = useRef<[number, number] | null>(null);
  const clicks = useRef(0);

  useEffect(() => {
    if (answer?.method !== "takeoff" || answer.evidence.length !== 1 || focus === null || !model) return;
    const element = cited.get(focus);
    if (!element) return;
    const seq = ++clicks.current;
    void ifcApi().then((api) => info(api, model, element)).then((properties) => {
      if (seq === clicks.current) setPicked(properties);
    });
    return () => { if (seq === clicks.current) clicks.current++; };
  }, [answer, cited, focus, model]);
  function ray(e: React.PointerEvent, meshes: THREE.Object3D[]) {
    const s = three.current;
    if (!s) return null;
    const r = s.renderer.domElement.getBoundingClientRect();
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), s.flat ? s.ortho : s.persp);
    const hits = rc.intersectObjects(meshes.filter((m) => m.visible), false);
    // In 2D the part above the cut is invisible but still hit by the ray.
    return hits.find((h) => !s.flat || h.point.y <= s.cut.constant || !CLIPPED.includes((h.object as THREE.Mesh).material as THREE.MeshBasicMaterial)) ?? null;
  }
  function pickCited(e: React.PointerEvent): number | null {
    if (cited.size === 0) return null;
    const meshes: THREE.Mesh[] = [];
    cited.forEach((el) => meshes.push(...el.meshes));
    const hit = ray(e, meshes);
    if (!hit) return null;
    for (const [i, el] of cited) if (el.meshes.includes(hit.object as THREE.Mesh)) return i;
    return null;
  }
  async function pickAny(e: React.PointerEvent) {
    const s = three.current;
    if (!s || !model) return;
    const hit = ray(e, s.root.children);
    const el = hit && model.elems.get(hit.object.userData.guid);
    const seq = ++clicks.current;
    const res = el ? await info(await ifcApi(), model, el) : null;
    if (seq === clicks.current) setPicked(res); // a newer click or file switch wins
  }

  const fitAll = () => {
    if (flat) return setView(false);
    setFloor(null);
    const b = model?.box;
    if (b) flyTo(b, 1.1);
  };
  const fitMarks = () => {
    if (focus !== null) return onFocus(null);
    const box = new THREE.Box3();
    cited.forEach((e) => e.meshes[0]?.visible && box.union(e.box));
    flyTo(box, 1.3);
  };
  const missing = answer ? answer.evidence.filter((e) => e.kind === "ifc").length - cited.size : 0;
  const hiddenMarks = [...cited.values()].filter((e) => floor !== null && e.storey !== floor).length;

  return (
    <div className={`model3d ${flat && floor !== null ? "flat" : ""}`}>
      <div
        ref={host}
        className="gl"
        onPointerDown={(e) => (down.current = [e.clientX, e.clientY])}
        onPointerMove={(e) => {
          if (e.buttons) return;
          const i = pickCited(e);
          if (i !== hover) onHover(i);
        }}
        onPointerUp={(e) => {
          const d = down.current;
          down.current = null;
          if (!d || Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 4) return;
          const i = pickCited(e);
          if (i !== null) onFocus(focus === i ? null : i);
          if (!demo) pickAny(e);
        }}
        onPointerLeave={() => hover !== null && onHover(null)}
        onDoubleClick={fitAll}
      />
      <div ref={tags} className="tags">
        {!demo && [...cited.keys()]
          .filter((i) => cited.size <= 25 || i === hover || i === focus)
          .map((i) => (
            <span key={`${answer?.trace.join()}-${i}`} data-i={i} className={`tag ${hover === i || focus === i ? "hot" : ""}`}>
              {i + 1}
            </span>
          ))}
      </div>
      {status && <div className="empty overlay">{status}</div>}
      {busy && <div className="busy" />}

      <div className="viewer-tools">
        <button onClick={fitAll}>Model</button>
        {cited.size > 0 && <button onClick={fitMarks}>All marks</button>}
        {model && model.storeys.length > 0 && (
          <span className="m3-seg">
            <button className={flat ? "" : "on"} onClick={() => setView(false)}>3D</button>
            <button className={flat ? "on" : ""} onClick={() => setView(true)} title="Floor plan cut 1.2 m above the floor">2D</button>
          </span>
        )}
      </div>

      {model && model.storeys.length > 0 && (
        <nav className="m3-floors" aria-label={floorLabels.floors}>
          <span className="m3-label">{floorLabels.floors}</span>
          {!flat && (
            <button className={floor === null ? "on" : ""} onClick={() => setFloor(null)}>
              {floorLabels.all}{cited.size > 0 && <i>{cited.size}</i>}
            </button>
          )}
          {model.storeys.map((s) => (
            <button key={s.id} className={floor === s.id ? "on" : ""} onClick={() => setFloor(s.id)} title={levelLabel(s.name, locale)}>
              <span className="ellipsis">{levelLabel(s.name, locale)}</span>
              {marksOn.get(s.id) ? <i>{marksOn.get(s.id)}</i> : null}
            </button>
          ))}
        </nav>
      )}

      {model && (
        <div className="m3-cats">
          {CATS.map((c) => (
            <label key={c} className={off.has(c) ? "" : "on"}>
              <input
                type="checkbox"
                checked={!off.has(c)}
                onChange={() => setOff((o) => {
                  const n = new Set(o);
                  if (n.has(c)) n.delete(c);
                  else n.add(c);
                  return n;
                })}
              />
              {c}
            </label>
          ))}
        </div>
      )}

      {picked && (
        <aside className="m3-info">
          <header>
            <b>{picked.title}</b>
            <button onClick={() => setPicked(null)} aria-label="Close">×</button>
          </header>
          <dl>
            {picked.rows.map(([k, v], i) => (
              <div key={i}><dt>{k}</dt><dd className="mono" title={v}>{v}</dd></div>
            ))}
          </dl>
        </aside>
      )}

      {(missing > 0 || hiddenMarks > 0) && (
        <div className="model-note mono">
          {hiddenMarks > 0 && `${hiddenMarks} mark(s) on other floors`}
          {hiddenMarks > 0 && missing > 0 && " · "}
          {missing > 0 && `${missing} cited element(s) have no 3D geometry`}
        </div>
      )}
      <div className="viewer-hint mono">
        {flat && floor !== null
          ? `plan cut 1.2 m above ${storey ? levelLabel(storey.name, locale) : floorLabels.level.toLowerCase()} · drag to pan · scroll to zoom · click for properties`
          : "drag to orbit · right-drag to pan · scroll to zoom · click for properties"}
      </div>
    </div>
  );
}
