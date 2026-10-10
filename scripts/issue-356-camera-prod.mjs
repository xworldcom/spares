#!/usr/bin/env node
/**
 * Real-browser 3D camera checks (#356): inline first-load, Reset, FS exit, buffer vs CSS.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/self/media/staff-app/issue-356-camera",
);
mkdirSync(outDir, { recursive: true });

const VIEWER_BG = { r: 18, g: 22, b: 28 };

async function measureCanvas(page) {
  return page.evaluate((bg) => {
    const canvas = document.querySelector("canvas");
    const root =
      document.querySelector("[data-machine-viewer-layout]") ??
      canvas?.closest(".relative");
    if (!canvas) {
      return { ok: false, reason: "no-canvas" };
    }
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const expectedBufferW = Math.round(rect.width * dpr);
    const expectedBufferH = Math.round(rect.height * dpr);
    const bufferDeltaW = Math.abs(canvas.width - expectedBufferW);
    const bufferDeltaH = Math.abs(canvas.height - expectedBufferH);
    const rootH = root instanceof HTMLElement ? root.clientHeight : rect.height;
    const heightLeak = rect.height - rootH;
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    let centerRgb = null;
    let modelVisible = false;
    if (gl && canvas.width > 0 && canvas.height > 0) {
      const probes = [
        [0.5, 0.5],
        [0.5, 0.32],
        [0.5, 0.68],
        [0.35, 0.45],
        [0.65, 0.45],
      ];
      for (const [fx, fy] of probes) {
        const pixels = new Uint8Array(4);
        gl.readPixels(
          Math.floor(canvas.width * fx),
          Math.floor(canvas.height * fy),
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixels,
        );
        const dr = Math.abs(pixels[0] - bg.r);
        const dg = Math.abs(pixels[1] - bg.g);
        const db = Math.abs(pixels[2] - bg.b);
        if (dr + dg + db > 24) {
          modelVisible = true;
          centerRgb = { r: pixels[0], g: pixels[1], b: pixels[2] };
          break;
        }
      }
      if (!centerRgb) {
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
        centerRgb = { r: pixels[0], g: pixels[1], b: pixels[2] };
      }
    }
    return {
      ok:
        rect.width > 80 &&
        rect.height > 80 &&
        bufferDeltaW <= 3 &&
        bufferDeltaH <= 3 &&
        heightLeak <= 2 &&
        modelVisible,
      clientW: Math.round(rect.width),
      clientH: Math.round(rect.height),
      bufferW: canvas.width,
      bufferH: canvas.height,
      bufferDeltaW,
      bufferDeltaH,
      heightLeak: Math.round(heightLeak * 10) / 10,
      centerRgb,
      modelVisible,
    };
  }, VIEWER_BG);
}

async function snapCanvas(page, path) {
  const canvas = page.locator("canvas").first();
  await canvas.screenshot({ path });
}

async function waitModelReady(page) {
  await page.waitForFunction(
    () => document.querySelector('[data-viewer-canonical-ready="true"]') != null,
    { timeout: 120000 },
  );
  await page.waitForTimeout(1200);
}

async function runMachineFlow(ctx, proof, machineSlug, widths, filePrefix) {
  for (const [w, h] of widths) {
    const tag = `${filePrefix}${w}`;
    const page = await ctx.newPage();
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${baseUrl}/machines/${machineSlug}`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    if (w === 390) {
      await page.getByRole("button", { name: "3D" }).click();
    }
    await page.locator("canvas").first().waitFor({ timeout: 90000 });
    await page.waitForFunction(
      () =>
        document.querySelector('[data-viewer-canonical-ready="true"]') != null,
      { timeout: 90000 },
    );
    await waitModelReady(page);

    const first = await measureCanvas(page);
    await snapCanvas(page, join(outDir, `${tag}-first-load.png`));
    proof.checks.push({ id: `${tag}-first-load`, ...first });
    if (!first.ok) proof.ok = false;

    const canvas = page.locator("canvas").first();
    const box = await canvas.boundingBox();
    if (box) {
      const y = box.y + box.height / 2;
      await page.mouse.move(box.x + box.width * 0.55, y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.25, y, { steps: 14 });
      await page.mouse.up();
      await page.waitForTimeout(400);
    }

    await page.getByRole("button", { name: "Reset view to first load" }).click();
    await page.waitForTimeout(800);
    const reset = await measureCanvas(page);
    await snapCanvas(page, join(outDir, `${tag}-after-reset.png`));
    proof.checks.push({ id: `${tag}-after-reset`, ...reset });
    if (!reset.ok) proof.ok = false;

    if (w >= 1024) {
      await page.getByRole("button", { name: "Enter full screen" }).click();
      await waitModelReady(page);
      await snapCanvas(page, join(outDir, `${tag}-fullscreen.png`));
      const fs = await measureCanvas(page);
      proof.checks.push({ id: `${tag}-fullscreen`, ...fs });
      if (!fs.ok) proof.ok = false;

      await page.getByRole("button", { name: "Exit full screen" }).click();
      await page.waitForTimeout(1500);
      const afterExit = await measureCanvas(page);
      await snapCanvas(page, join(outDir, `${tag}-after-exit-fs.png`));
      proof.checks.push({ id: `${tag}-after-exit-fs`, ...afterExit });
      if (!afterExit.ok) proof.ok = false;
    }

    await page.close();
  }
}

const proof = { baseUrl, checks: [], ok: true };
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
await ctx.request.post(`${baseUrl}/api/auth/login`, {
  data: { email: "user@demo.com", password: "demo123456" },
});

const widths = [
  [390, 844],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
];

await runMachineFlow(ctx, proof, "hardware-fixture", widths, "");

try {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/machines/palletizer`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "3D" }).click();
  await page.locator("canvas").first().waitFor({ timeout: 90000 });
  await page.waitForFunction(
    () =>
      document.querySelector('[data-viewer-canonical-ready="true"]') != null,
    { timeout: 120000 },
  );
  await waitCenterModelVisible(page);
  const pallet = await measureCanvas(page);
  await snapCanvas(page, join(outDir, "palletizer-390-hard-reload.png"));
  proof.checks.push({ id: "palletizer-390-hard-reload", ...pallet });
  if (!pallet.ok) proof.ok = false;
  await page.close();
} catch (error) {
  proof.checks.push({
    id: "palletizer-390-hard-reload",
    ok: false,
    reason: error instanceof Error ? error.message : String(error),
  });
  proof.ok = false;
}

await browser.close();
writeFileSync(join(outDir, "proof.json"), JSON.stringify(proof, null, 2));
console.log(JSON.stringify(proof, null, 2));
process.exit(proof.ok ? 0 : 1);
