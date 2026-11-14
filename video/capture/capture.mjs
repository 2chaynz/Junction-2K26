// Records real screen clips of the running demo (http://127.0.0.1:8000) with Playwright driving the installed Chrome.
//   node capture/capture.mjs            all scenes
//   node capture/capture.mjs swiss      one scene by name
import { chromium } from "playwright-core";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

import { fileURLToPath } from "node:url";
const DEMO = process.env.DEMO_URL ?? "http://127.0.0.1:8000/";
const OUT = fileURLToPath(new URL("../public/clips/", import.meta.url)); // not .pathname: that keeps %20 for spaces
mkdirSync(OUT, { recursive: true });

// A visible cursor (Playwright's video has none): a red dot that follows the mouse.
const CURSOR = `
  addEventListener("DOMContentLoaded", () => {
    const d = document.createElement("div");
    d.style.cssText = "position:fixed;z-index:99999;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(217,45,32,.55);border:2px solid #d92d20;pointer-events:none;transition:transform .08s";
    document.body.appendChild(d);
    addEventListener("mousemove", (e) => { d.style.left = e.clientX + "px"; d.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", () => (d.style.transform = "scale(.7)"), true);
    addEventListener("mouseup", () => (d.style.transform = ""), true);
  });`;

const pause = (p, ms) => p.waitForTimeout(ms);
async function click(p, locator) {
  const box = await locator.boundingBox();
  if (box) await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
  await pause(p, 250);
  await locator.click();
}
async function open(p, project, sheetText) {
  await p.goto(DEMO);
  await pause(p, 1800);
  await click(p, p.getByText(project, { exact: false }).first());
  await pause(p, 1500);
  const tab = p.getByText("Drawings", { exact: true }).first();     // projects open on an Overview page now
  if (await tab.isVisible().catch(() => false)) { await click(p, tab); await pause(p, 1200); }
  const search = p.getByPlaceholder(/Search /);
  await click(p, search);
  await p.keyboard.type(sheetText, { delay: 90 });
  await pause(p, 700);
  await click(p, p.getByRole("button", { name: new RegExp(sheetText) }).first());
  await pause(p, 2500);
}
async function ask(p, q, wait = 7000) {
  const box = p.getByPlaceholder(/Ask about this drawing/);
  await click(p, box);
  await p.keyboard.type(q, { delay: 22 });
  await pause(p, 500);
  await p.keyboard.press("Enter");
  await pause(p, wait);
}

const SCENES = {
  // Hook: the building in 3D, then Stoa's door question lights up every door of the ground floor, numbered.
  async hook3d(p) {
    await p.goto(DEMO);
    await pause(p, 1500);
    await click(p, p.getByText("Molio", { exact: false }).first());
    await pause(p, 1800);
    await click(p, p.getByRole("button", { name: /molio-with-uris/ }).first());
    await pause(p, 1500);
    await click(p, p.getByRole("button", { name: "3D", exact: true }).first());
    await pause(p, 9000);                                   // model loads, building shown whole
    await p.mouse.move(900, 560, { steps: 8 });
    await p.mouse.down();
    await p.mouse.move(1010, 540, { steps: 30 });           // a little orbit while it is still just a building
    await p.mouse.up();
    await pause(p, 700);
    await ask(p, "How many doors are shown on the floor plan of 'Grundplan'?", 7500);
    await p.mouse.move(900, 560, { steps: 8 });
    await p.mouse.down();
    await p.mouse.move(760, 520, { steps: 45 });            // orbit around the lit doors
    await p.mouse.up();
    await pause(p, 2500);
  },
  async swiss(p) {
    await open(p, "Swiss Dwellings", "2292");
    await ask(p, "How many doors (interior doors and entrance doors together) are drawn on this floor plan?", 9000);
  },
  async scan(p) {
    await open(p, "CubiCasa", "1506");
    await ask(p, "Kuinka monta WC-istuinta pohjapiirustukseen on piirretty?", 6000);   // Finnish, instant detector answer
    await ask(p, "How many windows are shown on this floor plan?", 6500);
  },
  async schedule(p) {
    await open(p, "Sports Complex", "A-801");
    await ask(p, "On sheet A-801 of the Xcel Sports Complex drawings, how many doors in the door schedule carry note C (card reader)?", 10000);
  },
  // The project Overview: sheet register, the "one place for the whole set" shot.
  async overview(p) {
    await p.goto(DEMO);
    await pause(p, 1500);
    await click(p, p.getByText("Sports Complex", { exact: false }).first());
    await pause(p, 3000);
    for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, 240); await pause(p, 600); }
    await pause(p, 1500);
  },
  async bim(p) {
    await p.goto(DEMO);
    await pause(p, 1800);
    await click(p, p.getByText("Molio", { exact: false }).first());
    await pause(p, 2000);
    await click(p, p.getByRole("button", { name: /molio-with-uris/ }).first());
    await pause(p, 2500);
    await click(p, p.getByRole("button", { name: "3D", exact: true }).first());
    await pause(p, 7000);
    await p.mouse.move(900, 540, { steps: 10 });
    await p.mouse.down();
    await p.mouse.move(1100, 500, { steps: 40 });
    await p.mouse.up();
    await pause(p, 3500);
  },
};

const only = process.argv[2];
const b = await chromium.launch({ channel: "chrome", headless: true });
for (const [name, fn] of Object.entries(SCENES)) {
  if (only && only !== name) continue;
  const dir = `${OUT}${name}/`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.addInitScript(CURSOR);
  const p = await ctx.newPage();
  // No video recorder (it needs a separate ffmpeg download): take frames from Chrome's screencast and let
  // Remotion play them back by timestamp. Frames only arrive when the page changes; the last one is held.
  const cdp = await ctx.newCDPSession(p);
  const frames = [];
  let t0 = null;
  cdp.on("Page.screencastFrame", async (f) => {
    const t = f.metadata.timestamp;
    if (t0 === null) t0 = t;
    const file = `${String(frames.length).padStart(5, "0")}.jpg`;
    writeFileSync(`${dir}${file}`, Buffer.from(f.data, "base64"));
    frames.push({ t: Math.round((t - t0) * 1000) / 1000, file });
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 85, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  try { await fn(p); console.log("ok", name); } catch (e) { console.log("FAILED", name, String(e).split("\n")[0]); await p.screenshot({ path: `${dir}fail.png` }).catch(() => {}); }
  await pause(p, 600);
  await cdp.send("Page.stopScreencast").catch(() => {});
  const duration = frames.length ? frames[frames.length - 1].t + 0.5 : 0;
  writeFileSync(`${dir}frames.json`, JSON.stringify({ name, duration, frames }));
  console.log(`  ${frames.length} frames, ${duration.toFixed(1)} s`);
  await ctx.close();
}
await b.close();
