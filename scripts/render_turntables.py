"""Render each IFC model as a slow 360° clay turntable for the Home project cards.

  pip install pyvista            # render-time only, not needed to run the app
  STOA_DATA=… python scripts/render_turntables.py [--only molio] [--seconds 10] [--fps 24]

Writes web/public/turntables/<ifc stem>.webm (seamless loop) + <stem>.jpg (poster, first frame).
Look follows the app: card background, near-white clay, soft shading, thin dark feature edges.
"""
from __future__ import annotations

import argparse
import math
import multiprocessing
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "public" / "turntables"
BG = "#f6f6f5"  # --canvas, the card background
SKIP = {"IfcSpace", "IfcOpeningElement", "IfcAnnotation", "IfcGrid", "IfcSite", "IfcVirtualElement"}
# Near-monochrome clay; glazing a touch cooler and lighter so windows still read.
TONE = {
    "IfcWindow": "#dfe6ee", "IfcCurtainWall": "#dfe6ee", "IfcPlate": "#dfe6ee",
    "IfcSlab": "#ecebe7", "IfcRoof": "#e6e4df", "IfcCovering": "#ecebe7",
    "IfcDoor": "#efe9e0",
}
WALL = "#fbfbfa"


def load(ifc_path: Path):
    """Triangles of every visible element, grouped by tone. Z-up, metres."""
    import ifcopenshell
    import ifcopenshell.geom

    f = ifcopenshell.open(str(ifc_path))
    s = ifcopenshell.geom.settings()
    s.set("use-world-coords", True)
    it = ifcopenshell.geom.iterator(s, f, multiprocessing.cpu_count())
    groups: dict[str, list[tuple[np.ndarray, np.ndarray]]] = {}
    if not it.initialize():
        return groups
    while True:
        shape = it.get()
        if shape.type not in SKIP:
            g = shape.geometry
            v = np.asarray(g.verts, dtype=np.float32).reshape(-1, 3)
            t = np.asarray(g.faces, dtype=np.int64).reshape(-1, 3)
            if len(t):
                groups.setdefault(TONE.get(shape.type, WALL), []).append((v, t))
        if not it.next():
            break
    return groups


def meshes(groups):
    import pyvista as pv

    out = {}
    for tone, parts in groups.items():
        verts, faces, off = [], [], 0
        for v, t in parts:
            verts.append(v)
            faces.append(np.hstack([np.full((len(t), 1), 3), t + off]))
            off += len(v)
        out[tone] = pv.PolyData(np.vstack(verts), np.vstack(faces).ravel()).clean()
    return out


def fit_distance(lo, hi, centre, elev, aspect, fov=30.0, margin=0.86) -> float:
    """Closest camera distance where the model's box stays inside the frame at every angle of the turn."""
    corners = np.array([[x, y, z] for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])])
    ty = math.tan(math.radians(fov / 2)) * margin
    tx = ty * aspect
    up = np.array([0.0, 0.0, 1.0])

    def fits(r: float) -> bool:
        for a in np.linspace(0, 2 * math.pi, 48, endpoint=False):
            cam = centre + r * np.array([math.cos(elev) * math.cos(a), math.cos(elev) * math.sin(a), math.sin(elev)])
            f = (centre - cam) / np.linalg.norm(centre - cam)
            right = np.cross(f, up)
            right /= np.linalg.norm(right)
            u = np.cross(right, f)
            d = corners - cam
            z = d @ f
            if (z <= 0).any() or (np.abs(d @ right / z) > tx).any() or (np.abs(d @ u / z) > ty).any():
                return False
        return True

    diag = float(np.linalg.norm(hi - lo))
    a, b = 0.2 * diag, 6 * diag
    for _ in range(40):
        m = (a + b) / 2
        a, b = (a, m) if fits(m) else (m, b)
    return b


def render(ifc_path: Path, seconds: float, fps: int, size=(960, 600)) -> bool:
    import pyvista as pv

    groups = load(ifc_path)
    if not groups:
        print(f"  {ifc_path.name}: no geometry, skipped")
        return False
    ms = meshes(groups)
    allm = pv.merge(list(ms.values()))
    # Drop far-away outliers (site furniture, stray points) so the camera frames the building.
    lo, hi = np.percentile(allm.points, 1, axis=0), np.percentile(allm.points, 99, axis=0)
    centre = (lo + hi) / 2
    diag = float(np.linalg.norm(hi - lo))

    p = pv.Plotter(off_screen=True, window_size=size, lighting="none")
    p.set_background(BG)
    p.add_light(pv.Light(light_type="headlight", intensity=0.35))
    key = pv.Light(position=(centre[0] - diag, centre[1] - diag * 0.6, centre[2] + diag * 1.4),
                   focal_point=tuple(centre), intensity=0.75, light_type="scene light")
    fill = pv.Light(position=(centre[0] + diag, centre[1] + diag, centre[2] + diag * 0.5),
                    focal_point=tuple(centre), intensity=0.3, light_type="scene light")
    p.add_light(key)
    p.add_light(fill)
    for tone, m in ms.items():
        glass = tone == TONE["IfcWindow"]
        p.add_mesh(m, color=tone, smooth_shading=False, ambient=0.35, diffuse=0.7, specular=0.05,
                   opacity=0.85 if glass else 1.0)
    edges = allm.extract_feature_edges(feature_angle=35, boundary_edges=False, non_manifold_edges=False,
                                       manifold_edges=False)
    if edges.n_points:
        p.add_mesh(edges, color="#2b2b2b", line_width=1, opacity=0.55)
    # Soft contact shadow: a ground disc a shade darker than the card.
    ground = pv.Disc(center=(centre[0], centre[1], float(lo[2]) - 0.05), inner=0, outer=diag * 0.48, c_res=96)
    p.add_mesh(ground, color="#ecebe8", ambient=1.0, diffuse=0.0, specular=0.0)
    try:
        p.enable_ssao(radius=diag * 0.02, bias=diag * 0.001, kernel_size=64, blur=True)
    except Exception:
        pass  # older VTK: no ambient occlusion, the render still works
    p.enable_anti_aliasing("ssaa")

    elev = math.radians(26)
    r = fit_distance(lo, hi, centre, elev, size[0] / size[1])
    frames = int(seconds * fps)
    tmp = Path(tempfile.mkdtemp(prefix="turn-"))
    try:
        import time
        t0 = time.time()
        for i in range(frames):
            a = math.radians(-40) + 2 * math.pi * i / frames  # exactly one turn: seamless loop
            # camera_position marks the camera as set; plain attribute writes get reset on render.
            p.camera_position = [(centre[0] + r * math.cos(elev) * math.cos(a),
                                  centre[1] + r * math.cos(elev) * math.sin(a),
                                  centre[2] + r * math.sin(elev)), tuple(centre), (0, 0, 1)]
            p.camera.view_angle = 30
            p.render()  # screenshot() alone returns the previous frame when off screen
            p.screenshot(str(tmp / f"f{i:04d}.png"))
        print(f"  {frames} frames in {time.time() - t0:.0f}s", flush=True)
        p.close()
        stem = ifc_path.stem
        OUT.mkdir(parents=True, exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(fps), "-i", str(tmp / "f%04d.png"),
                        "-vf", "scale=640:-2", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "40", "-row-mt", "1",
                        "-pix_fmt", "yuv420p", "-an", str(OUT / f"{stem}.webm")], check=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(tmp / "f0000.png"), "-vf", "scale=640:-2",
                        "-q:v", "4", str(OUT / f"{stem}.jpg")], check=True)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    kb = (OUT / f"{ifc_path.stem}.webm").stat().st_size // 1024
    print(f"  {ifc_path.name}: {sum(len(m.faces) for m in ms.values()) // 4:,} triangles → {kb} KB")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="substring of the IFC file name")
    ap.add_argument("--seconds", type=float, default=12)
    ap.add_argument("--fps", type=int, default=24)
    a = ap.parse_args()
    data = Path(os.environ.get("STOA_DATA", "")) / "data"
    if not data.is_dir():
        sys.exit("set STOA_DATA to the unzipped dataset folder")
    files = sorted(list((data / "ifc_models").glob("*.ifc")) + list((data / "ifc_bench").glob("*.ifc")))
    for f in files:
        if a.only and a.only not in f.name:
            continue
        print(f"rendering {f.name}…", flush=True)
        try:
            render(f, a.seconds, a.fps)
        except Exception as e:  # one broken model must not stop the others
            print(f"  {f.name}: failed: {e!r}")


if __name__ == "__main__":
    main()
