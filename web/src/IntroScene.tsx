import { useEffect, useRef } from "react";
import * as THREE from "three";
import { T } from "./introTime";

// A stylised apartment, metres, plan coords (x, z). Gaps in the walls are the doors.
const WALLS: [number, number, number, number][] = [
  [-8, -5, 8, -5], [8, -5, 8, 5], [8, 5, -1, 5], [-3, 5, -8, 5], [-8, 5, -8, -5],
  [-2, -5, -2, -1.2], [-2, 0.2, -2, 3],
  [-8, 1, -6, 1], [-4.6, 1, -2, 1],
  [3, -5, 3, -2], [3, -0.6, 3, 5],
  [3, 1, 5, 1], [6.4, 1, 8, 1],
  [-2, 3, 0, 3], [1.4, 3, 3, 3],
];
const DOORS: [number, number, boolean][] = [ // x, z, wall runs along x
  [-2, 5, true], [-2, -0.5, false], [-5.3, 1, true], [3, -1.3, false], [5.7, 1, true], [0.7, 3, true],
];
const H = 2.8, STOREY = 3.3, FLOORS = 4, MARKED = 1; // doors are marked on the 2nd floor
// Site palette: ink lines on white, one red accent for evidence.
const INK = "#1a1a1a", RED = "#d92d20";

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const phase = (t: number, [a, b]: readonly [number, number]) => clamp((t - a) / (b - a));
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const back = (x: number) => 1 + 2.4 * Math.pow(x - 1, 3) + 1.4 * Math.pow(x - 1, 2);

function storey() {
  const g = new THREE.Group();
  const face = new THREE.MeshLambertMaterial({ color: "#ffffff", transparent: true, opacity: 0.78, depthWrite: false });
  const edge = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.85 });
  const walls: THREE.Mesh[] = [];
  for (const [x1, z1, x2, z2] of WALLS) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const geo = new THREE.BoxGeometry(len, H, 0.22).translate(0, H / 2, 0);
    const m = new THREE.Mesh(geo, face);
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edge));
    m.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
    m.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    walls.push(m);
    g.add(m);
  }
  const slabGeo = new THREE.BoxGeometry(16.4, 0.16, 10.4).translate(0, -0.08, 0);
  const slabMat = new THREE.MeshLambertMaterial({ color: "#f6f6f5", transparent: true, opacity: 0.9, depthWrite: false });
  const slab = new THREE.Mesh(slabGeo, slabMat);
  slab.add(new THREE.LineSegments(new THREE.EdgesGeometry(slabGeo), edge));
  g.add(slab);
  return { g, walls, face, edge, slabMat };
}

type Props = { start: number | null; onReady: () => void; onFrame: (t: number) => void };

export default function IntroScene({ start, onReady, onFrame }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const startRef = useRef(start);
  startRef.current = start;
  const frameRef = useRef(onFrame);
  frameRef.current = onFrame;

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog("#ffffff", 45, 95); // grid fades into the page instead of a moiré horizon
    scene.add(new THREE.HemisphereLight("#ffffff", "#d9d9d9", 2.6));
    const sun = new THREE.DirectionalLight("#ffffff", 0.9);
    sun.position.set(12, 20, 6);
    scene.add(sun);
    const grid = new THREE.GridHelper(140, 70, "#e6e6e6", "#eeeeee");
    grid.position.y = -0.2;
    scene.add(grid);
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 400);

    // 1. The plan, drawn as one continuous pen stroke across all walls.
    const lens = WALLS.map(([x1, z1, x2, z2]) => Math.hypot(x2 - x1, z2 - z1));
    const total = lens.reduce((a, b) => a + b, 0);
    const penPos = new Float32Array(WALLS.length * 6);
    const penGeo = new THREE.BufferGeometry();
    penGeo.setAttribute("position", new THREE.BufferAttribute(penPos, 3));
    const penMat = new THREE.LineBasicMaterial({ color: INK, transparent: true });
    scene.add(new THREE.LineSegments(penGeo, penMat));

    // 2–3. Storeys: the ground one rises from the plan, the rest drop onto it.
    const floors = Array.from({ length: FLOORS }, (_, i) => {
      const s = storey();
      s.g.position.y = i * STOREY;
      s.g.visible = false;
      scene.add(s.g);
      return s;
    });

    // 4. Evidence: red doors, always drawn on top like the app's marks.
    const doorMat = new THREE.MeshBasicMaterial({ color: RED, depthTest: false, transparent: true, opacity: 0.92 });
    const marks = DOORS.map(([x, z, alongX]) => {
      const door = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 1.3 : 0.24, 2.1, alongX ? 0.24 : 1.3).translate(0, 1.05, 0), doorMat);
      door.renderOrder = 10;
      door.position.set(x, MARKED * STOREY, z);
      door.scale.setScalar(0.001);
      scene.add(door);
      return door;
    });

    const resize = () => {
      const w = el.clientWidth, h = Math.max(el.clientHeight, 1);
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const top = new THREE.Vector3(1, 40, 11);
    const look = new THREE.Vector3(), orbit = new THREE.Vector3();
    let raf = 0;
    const tick = () => {
      const s0 = startRef.current;
      const t = s0 === null ? 0 : (performance.now() - s0) / 1000;

      // Pen: walls appear in order, each growing from its start point.
      let left = easeInOut(phase(t, T.draw)) * total;
      WALLS.forEach(([x1, z1, x2, z2], i) => {
        const k = clamp(left / lens[i]);
        left -= lens[i];
        penPos.set([x1, 0.02, z1, x1 + (x2 - x1) * k, 0.02, z1 + (z2 - z1) * k], i * 6);
      });
      penGeo.attributes.position.needsUpdate = true;
      penMat.opacity = 1 - phase(t, [T.rise[1] - 0.1, T.rise[1] + 0.3]);

      floors.forEach((f, i) => {
        if (i === 0) {
          f.g.visible = t >= T.rise[0];
          f.walls.forEach((w, k) => {
            w.scale.y = Math.max(easeOut(clamp((t - T.rise[0] - k * 0.02) / (T.rise[1] - T.rise[0] - 0.28))), 0.001);
          });
          return;
        }
        const k = easeOut(clamp((t - T.stack[0] - (i - 1) * 0.14) / 0.5));
        f.g.visible = k > 0;
        f.g.position.y = i * STOREY + (1 - k) * 5;
        f.face.opacity = 0.78 * k;
        f.edge.opacity = 0.85 * k;
        f.slabMat.opacity = 0.9 * k;
      });

      marks.forEach((m, i) => {
        const k = clamp((t - T.marks[0] - i * 0.05) / 0.28);
        m.scale.setScalar(Math.max(back(k), 0.001));
      });

      // Camera: a near-top view while drawing, then one continuous sweep into a slow orbit.
      const c = easeInOut(phase(t, [T.rise[0] - 0.1, T.marks[1]]));
      const a = Math.PI / 4 + t * 0.12;
      const r = 36 + c * 2;
      orbit.set(Math.cos(a) * r, 13 + c * 5, Math.sin(a) * r);
      camera.position.lerpVectors(top, orbit, c);
      look.set(0, c * 4.2, 0);
      camera.lookAt(look);
      // Final beat: the building slides to the right third, leaving room for the title on the left.
      const w = el.clientWidth, h = Math.max(el.clientHeight, 1);
      const slide = easeInOut(phase(t, [T.end - 0.35, T.end + 0.45]));
      if (slide > 0) camera.setViewOffset(w, h, -w * 0.2 * slide, 0, w, h);
      else camera.clearViewOffset();

      renderer.render(scene, camera);
      frameRef.current(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    onReady();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={host} className="intro-gl" />;
}
