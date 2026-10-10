#!/usr/bin/env node
/**
 * Spot-check M10/M12 on local dev (staff session cookie jar from control-oee360).
 */
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const baseUrl = process.env.OEE360_BASE_URL || "http://127.0.0.1:3010";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/self/media/staff-app/sam-m10-m14-verify",
);

function cookiesFromJar(jarPath, host) {
  const text = readFileSync(jarPath, "utf8");
  const cookies = [];
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const parts = line.split("\t");
    if (parts.length < 7) continue;
    const [, , path, , , name, value] = parts;
    cookies.push({ name, value, domain: host, path });
  }
  return cookies;
}

const jar = join(__dirname, "../.run-state/cookies.txt");
const host = new URL(baseUrl).hostname;

const viewports = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "phone-390", width: 390, height: 844 },
];

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.addCookies(cookiesFromJar(jar, host));

for (const vp of viewports) {
  const page = await context.newPage();
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.goto(`${baseUrl}/staff/directory?type=customer`, {
    waitUntil: "networkidle",
  });
  await page.screenshot({
    path: join(outDir, `${vp.name}-directory-customers.png`),
    fullPage: true,
  });
  await page.goto(`${baseUrl}/staff/quotes/26`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({
    path: join(outDir, `${vp.name}-quote-26.png`),
    fullPage: true,
  });
  await page.close();
}

await browser.close();
console.log(JSON.stringify({ ok: true, outDir }, null, 2));
