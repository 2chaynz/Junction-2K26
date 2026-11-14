/// <reference types="vite/client" />
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { IFCSPACE, IfcAPI, type FlatMesh } from "web-ifc";
import wasmUrl from "web-ifc/web-ifc.wasm?url";
import type { Answer } from "./types";

type Props = {
  path: string;
  answer: Answer | null;
  hover: number | null;
  focus: number | null;
  onHover: (i: number | null) => void;
  onFocus: (i: number | null) => void;
  busy: boolean;
};

type Elem = { guid: string; space: boolean; meshes: THREE.Mesh[]; base: THREE.Material[]; box: THREE.Box3 };

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
const mats = {
  opaque: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  glass: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.35, depthWrite: false }),
  ghost: new THREE.MeshLambertMaterial({ color: "#8a8f98", transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide }),
  mark: new THREE.MeshLambertMaterial({ color: RED, emissive: RED, emissiveIntensity: 0.25, side: THREE.DoubleSide }),
  hot: new THREE.MeshLambertMaterial({ color: RED, emissive: RED, emissiveIntensity: 0.8, side: THREE.DoubleSide }),
  room: new THREE.MeshLambertMaterial({ color: RED, emissive: RED, emissiveIntensity: 0.2, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }),
  roomHot: new THREE.MeshLambertMaterial({ color: RED, emissive: RED, emissiveIntensity: 0.6, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
};

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

async function load(path: string, root: THREE.Group, alive: () => boolean): Promise<Map<string, Elem>> {
  const [a, buf] = await Promise.all([ifcApi(), fetch(`/api/ifc?path=${encodeURIComponent(path)}`).then((r) => {
    if (!r.ok) throw new Error(`ifc: ${r.status}`);
    return r.arrayBuffer();
  })]);
  await new Promise((r) => setTimeout(r, 30)); // let "Loading" paint: streaming blocks the thread
  if (!alive()) return new Map();
  const id = a.OpenModel(new Uint8Array(buf), { COORDINATE_TO_ORIGIN: true });
  const out = new Map<string, Elem>();
  try {
    const onMesh = (fm: FlatMesh) => {
      const solid: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [];
      for (let k = 0; k < fm.geometries.size(); k++) {
        const pg = fm.geometries.get(k);
        const geo = a.GetGeometry(id, pg.geometryExpressID);
        const v = a.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize());
        const idx = a.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize());
        if (idx.length) (pg.color.w < 0.99 ? glass : solid).push(toGeometry(v, idx, pg.flatTransformation, pg.color));
        geo.delete();
      }
      const line = a.GetLine(id, fm.expressID);
      const guid: string | undefined = line?.GlobalId?.value;
      if (!guid || out.has(guid) || !(solid.length || glass.length)) return;
      const space = line.type === IFCSPACE;
      const e: Elem = { guid, space, meshes: [], base: [], box: new THREE.Box3() };
      for (const [parts, mat] of [[solid, mats.opaque], [glass, mats.glass]] as const) {
        if (!parts.length) continue;
        const g = parts.length === 1 ? parts[0] : mergeGeometries(parts)!;
        parts.forEach((p) => p !== g && p.dispose());
        g.computeBoundingBox();
        e.box.union(g.boundingBox!);
        const mesh = new THREE.Mesh(g, mat);
        mesh.userData.guid = guid;
        mesh.visible = !space;
        e.meshes.push(mesh);
        e.base.push(mat);
        root.add(mesh);
      }
      out.set(guid, e);
    };
    a.StreamAllMeshes(id, onMesh);
    // web-ifc skips spaces by default; room answers cite them, so stream them too (hidden until cited).
    a.StreamAllMeshesWithTypes(id, [IFCSPACE], onMesh);
  } finally {
    a.CloseModel(id);
  }
  return out;
}

export default function Model3D({ path, answer, hover, focus, onHover, onFocus, busy }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const tags = useRef<HTMLDivElement>(null);
  const three = useRef<{
    renderer: THREE.WebGLRenderer; camera: THREE.PerspectiveCamera; controls: OrbitControls;
    root: THREE.Group; sweep: THREE.Mesh; fly: ((t: number) => void) | null; tick: (t: number) => void;
  } | null>(null);
  const [elems, setElems] = useState<Map<string, Elem> | null>(null);
  const [status, setStatus] = useState("");
  const busyRef = useRef(busy);
  busyRef.current = busy;

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

  // Scene, renderer and loop live as long as the component.
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight("#ffffff", "#b8b8b0", 2.2));
    const sun = new THREE.DirectionalLight("#ffffff", 1.4);
    sun.position.set(1, 2, 1.5);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 5000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    const root = new THREE.Group();
    scene.add(root);
    const sweep = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }),
    );
    sweep.visible = false;
    scene.add(sweep);

    const resize = () => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / Math.max(el.clientHeight, 1);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const v = new THREE.Vector3();
    let raf = 0;
    const s = {
      renderer, camera, controls, root, sweep, fly: null as ((t: number) => void) | null,
      tick: (t: number) => {
        s.fly?.(t);
        controls.update();
        // Scan sweep: a red plane rising through the model while the question runs.
        const box = (root.userData.box as THREE.Box3 | undefined);
        sweep.visible = busyRef.current && !!box;
        if (sweep.visible && box) {
          const size = box.getSize(v);
          sweep.scale.set(size.x * 1.15, 1, size.z * 1.15);
          const c = box.getCenter(new THREE.Vector3());
          sweep.position.set(c.x, box.min.y + ((t / 1600) % 1) * size.y, c.z);
        }
        renderer.render(scene, camera);
        // Number tags follow their element on screen, like the 2D margin numbers.
        const w = el.clientWidth, h = el.clientHeight;
        for (const tag of Array.from(tags.current?.children ?? []) as HTMLElement[]) {
          const e = citedRef.current.get(Number(tag.dataset.i));
          if (!e) continue;
          e.box.getCenter(v);
          v.y = e.box.max.y;
          v.project(camera);
          const on = v.z < 1;
          tag.style.display = on ? "" : "none";
          tag.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
        }
        raf = requestAnimationFrame(s.tick);
      },
    };
    three.current = s;
    raf = requestAnimationFrame(s.tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      three.current = null;
    };
  }, []);

  function flyTo(box: THREE.Box3, pad: number) {
    const s = three.current;
    if (!s || box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const r = box.getBoundingSphere(new THREE.Sphere()).radius * pad;
    const dist = Math.max(r / Math.sin((s.camera.fov * Math.PI) / 360), 1.5);
    const dir = s.camera.position.clone().sub(s.controls.target).normalize();
    if (!isFinite(dir.x) || dir.lengthSq() === 0) dir.set(1, 0.8, 1).normalize();
    const p0 = s.camera.position.clone(), t0 = s.controls.target.clone(), p1 = c.clone().addScaledVector(dir, dist);
    let start = -1;
    s.fly = (t) => {
      if (start < 0) start = t;
      const k = Math.min((t - start) / 700, 1), e = 1 - Math.pow(1 - k, 3);
      s.camera.position.lerpVectors(p0, p1, e);
      s.controls.target.lerpVectors(t0, c, e);
      if (k === 1) s.fly = null;
    };
  }

  // Load the model whenever the IFC file changes.
  useEffect(() => {
    const s = three.current!;
    let dead = false;
    setElems(null);
    setStatus("Loading model…");
    for (const m of [...s.root.children] as THREE.Mesh[]) m.geometry.dispose();
    s.root.clear();
    load(path, s.root, () => !dead)
      .then((m) => {
        if (dead) return;
        const box = new THREE.Box3();
        m.forEach((e) => !e.space && box.union(e.box));
        s.root.userData.box = box;
        const c = box.getCenter(new THREE.Vector3());
        const r = box.getBoundingSphere(new THREE.Sphere()).radius;
        s.camera.near = Math.max(r / 1000, 0.01);
        s.camera.far = r * 20;
        s.camera.updateProjectionMatrix();
        s.controls.target.copy(c);
        s.camera.position.copy(c).add(new THREE.Vector3(1, 0.75, 1).normalize().multiplyScalar(r * 2.2));
        setElems(m);
        setStatus("");
      })
      .catch((e) => !dead && setStatus(`Could not load the model: ${String(e)}`));
    return () => {
      dead = true;
      for (const m of [...s.root.children] as THREE.Mesh[]) m.geometry.dispose();
      s.root.clear();
    };
  }, [path]);

  // Highlight: cited elements red, the rest ghosted. No GUID evidence → normal colours.
  useEffect(() => {
    if (!elems) return;
    const marked = new Set(cited.values());
    const any = marked.size > 0;
    const hotEl = hover !== null ? cited.get(hover) : focus !== null ? cited.get(focus) : undefined;
    elems.forEach((e) => {
      e.meshes.forEach((m, k) => {
        if (marked.has(e)) {
          const hot = e === hotEl;
          m.material = e.space ? (hot ? mats.roomHot : mats.room) : hot ? mats.hot : mats.mark;
          m.visible = true;
          m.renderOrder = 2;
        } else {
          m.material = any ? mats.ghost : e.base[k];
          m.visible = !e.space;
          m.renderOrder = any ? 1 : 0;
        }
      });
    });
  }, [elems, cited, hover, focus]);

  // New answer → frame everything it cites; focus → fly to that element.
  useEffect(() => {
    if (!elems) return;
    const f = focus !== null ? cited.get(focus) : undefined;
    if (f) return flyTo(f.box, 2.2);
    const box = new THREE.Box3();
    cited.forEach((e) => box.union(e.box));
    if (!box.isEmpty()) flyTo(box, 1.3);
  }, [cited, focus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Picking: only cited elements react, so the model behaves like the 2D marks.
  const down = useRef<[number, number] | null>(null);
  function pick(e: React.PointerEvent): number | null {
    const s = three.current;
    if (!s || cited.size === 0) return null;
    const r = s.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), s.camera);
    const meshes: THREE.Mesh[] = [];
    cited.forEach((el) => meshes.push(...el.meshes));
    const hit = ray.intersectObjects(meshes, false)[0];
    if (!hit) return null;
    for (const [i, el] of cited) if (el.meshes.includes(hit.object as THREE.Mesh)) return i;
    return null;
  }

  const fitAll = () => {
    const b = three.current?.root.userData.box as THREE.Box3 | undefined;
    if (b) flyTo(b, 1.1);
  };
  const fitMarks = () => {
    if (focus !== null) return onFocus(null);
    const box = new THREE.Box3();
    cited.forEach((e) => box.union(e.box));
    flyTo(box, 1.3);
  };
  const missing = answer ? answer.evidence.filter((e) => e.kind === "ifc").length - cited.size : 0;

  return (
    <div className="model3d">
      <div
        ref={host}
        className="gl"
        onPointerDown={(e) => (down.current = [e.clientX, e.clientY])}
        onPointerMove={(e) => {
          if (e.buttons) return;
          const i = pick(e);
          if (i !== hover) onHover(i);
        }}
        onPointerUp={(e) => {
          const d = down.current;
          down.current = null;
          if (!d || Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 4) return;
          const i = pick(e);
          if (i !== null) onFocus(focus === i ? null : i);
        }}
        onPointerLeave={() => hover !== null && onHover(null)}
        onDoubleClick={fitAll}
      />
      <div ref={tags} className="tags">
        {[...cited.keys()]
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
      </div>
      {missing > 0 && <div className="model-note mono">{missing} cited element(s) have no 3D geometry</div>}
      <div className="viewer-hint mono">drag to orbit · right-drag to pan · scroll to zoom · double-click to fit</div>
    </div>
  );
}
