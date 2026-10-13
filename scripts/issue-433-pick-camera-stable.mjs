#!/usr/bin/env node
/**
 * #433 — picking a part must not reset the 3D orbit after the user has moved the camera.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, devices } from "playwright";

const baseUrl = process.env.OEE360_BASE_URL || "http://127.0.0.1:3010";
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(baseUrl);
const loginEmail =
  process.env.OEE360_LOGIN_EMAIL ||
  (isLocal ? "customer@spares.local" : "user@demo.com");
const loginPassword =
  process.env.OEE360_LOGIN_PASSWORD ||
  (isLocal ? "SparesCustomer1!" : "demo123456");
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    join(process.cwd(), ".cursor/skills/verify-oee360/evidence/issue-433"),
);
mkdirSync(outDir, { recursive: true });

const VIEWER_BG = { r: 18, g: 22, b: 28 };

async function sampleCanvas(page) {
  return page.evaluate((bg) => {
    const canvas = document.querySelector("canvas");
    const gl = canvas?.getContext("webgl2") || canvas?.getContext("webgl");
    if (!gl || !canvas || canvas.width < 1) {
      return { ok: false, reason: "no-gl" };
    }
    function px(x, y) {
      const pixels = new Uint8Array(4);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return { r: pixels[0], g: pixels[1], b: pixels[2] };
    }
    const w = canvas.width;
    const h = canvas.height;
    const center = px(Math.floor(w / 2), Math.floor(h / 2));
    const corner = px(Math.floor(w * 0.72), Math.floor(h * 0.38));
    const dist = (a, b) =>
      Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
    const bgDist = dist(center, bg);
    return {
      ok: true,
      center,
      corner,
      bgDist,
      modelVisible: bgDist > 24,
    };
  }, VIEWER_BG);
}

function rgbDist(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

async function waitCenterModelVisible(page) {
  await page.waitForFunction(
    (bg) => {
      const canvas = document.querySelector("canvas");
      const gl = canvas?.getContext("webgl2") || canvas?.getContext("webgl");
      if (!gl || !canvas || canvas.width < 1) {
        return false;
      }
      const pixels = new Uint8Array(4);
      gl.readPixels(
        Math.floor(canvas.width / 2),
        Math.floor(canvas.height / 2),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      );
      const dr = Math.abs(pixels[0] - bg.r);
      const dg = Math.abs(pixels[1] - bg.g);
      const db = Math.abs(pixels[2] - bg.b);
      return dr + dg + db > 24;
    },
    VIEWER_BG,
    { timeout: 120000 },
  );
}

const proof = { baseUrl, checks: [], ok: true };
const browser = await chromium.launch({ headless: true });
const iphone = devices["iPhone 13"];
const ctx = await browser.newContext({ ...iphone });
ctx.setDefaultTimeout(120000);
const loginRes = await ctx.request.post(`${baseUrl}/api/auth/login`, {
  data: { email: loginEmail, password: loginPassword },
});
if (!loginRes.ok()) {
  throw new Error(`login failed ${loginRes.status()}: ${await loginRes.text()}`);
}
const page = await ctx.newPage();
await page.goto(`${baseUrl}/machines/hardware-fixture`, {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await page.getByRole("button", { name: "3D" }).click();
await page.locator("canvas").first().waitFor({ timeout: 90000 });
await waitCenterModelVisible(page);

const firstLoad = await sampleCanvas(page);
proof.checks.push({ id: "first-load", ...firstLoad });

const canvas = page.locator("canvas").first();
const box = await canvas.boundingBox();
if (!box) {
  proof.ok = false;
  proof.checks.push({ id: "canvas-box", ok: false });
} else {
  const midY = box.y + box.height * 0.45;
  await page.mouse.move(box.x + box.width * 0.62, midY);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.28, midY, { steps: 18 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  const afterOrbit = await sampleCanvas(page);
  const orbitMoved =
    rgbDist(afterOrbit.center, firstLoad.center) > 8 ||
    rgbDist(afterOrbit.corner, firstLoad.corner) > 8;

  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.42);
  await page.waitForTimeout(600);

  const afterPick = await sampleCanvas(page);
  const pickSnappedBack =
    rgbDist(afterPick.center, firstLoad.center) < 6 &&
    rgbDist(afterPick.corner, firstLoad.corner) < 6 &&
    orbitMoved;

  const stableAfterPick =
    orbitMoved &&
    (rgbDist(afterPick.center, afterOrbit.center) < 10 ||
      rgbDist(afterPick.corner, afterOrbit.corner) < 10);

  proof.checks.push({
    id: "iphone-orbit-then-pick",
    orbitMoved,
    pickSnappedBack,
    stableAfterPick,
    pass: orbitMoved && stableAfterPick && !pickSnappedBack,
  });
  if (!proof.checks.at(-1).pass) proof.ok = false;

  await page.screenshot({
    path: join(outDir, "iphone-after-pick.png"),
    fullPage: false,
  });
}

await browser.close();
writeFileSync(join(outDir, "proof.json"), JSON.stringify(proof, null, 2));
console.log(JSON.stringify(proof, null, 2));
process.exit(proof.ok ? 0 : 1);
