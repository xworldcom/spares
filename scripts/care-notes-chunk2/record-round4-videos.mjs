#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync, renameSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { cdpTouchDrag, waitSheetSettled } from "./gesture-lib.cjs";

const baseUrl = process.argv[2] || "http://127.0.0.1:3010";
const outDir =
  process.argv[3] ||
  "/cursor/stores/bc-7479d24f-d92e-51f0-ab53-0ec629d66015/media/care-notes-chunk2";
mkdirSync(outDir, { recursive: true });

async function recordViewport(width, height, name) {
  const browser = await chromium.launch({ headless: true });
  const videoDir = join(outDir, `.tmp-${name}`);
  mkdirSync(videoDir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir: videoDir, size: { width, height } },
  });
  const page = await context.newPage();
  await page.request.post(`${baseUrl}/api/auth/login`, {
    data: { email: "staff@spares.local", password: "SparesStaff1!" },
  });
  await page.request.post(`${baseUrl}/api/staff/quotes/preview-fixture`);
  const quoteId = "quote-preview-qa-conversation";
  await page.request.patch(`${baseUrl}/api/quotes/${quoteId}/assistant`, { data: { paused: true } });
  for (let n = 1; n <= 2; n += 1) {
    await page.request.post(`${baseUrl}/api/quotes/${quoteId}/activity`, {
      data: { text: `Round4 video line ${n}.` },
    });
  }
  await page.goto(`${baseUrl}/staff/quotes/${quoteId}?sheetDebug=1`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-conversation-sheet]").waitFor();
  await page.waitForTimeout(700);

  async function drag(dy, steps, pauseMs = 40) {
    const box = await page.locator(".snap-sheet-handle").first().boundingBox();
    const hx = box.x + box.width / 2;
    const hy = box.y + box.height / 2;
    await cdpTouchDrag(page, hx, hy, hx, hy + dy, steps, pauseMs);
    await waitSheetSettled(page);
    await page.waitForTimeout(450);
  }

  await drag(-150, 56, 42);
  await drag(-280, 52, 42);
  await drag(220, 48, 40);
  await drag(300, 56, 40);
  await page.waitForTimeout(600);

  await context.close();
  await browser.close();
  const webm = readdirSync(videoDir).find((f) => f.endsWith(".webm"));
  if (!webm) throw new Error("no webm");
  renameSync(join(videoDir, webm), join(outDir, `round-4-${name}.webm`));
  console.log("wrote", join(outDir, `round-4-${name}.webm`));
}

await recordViewport(390, 844, "390x844-pull");
await recordViewport(320, 568, "320x568-pull");
