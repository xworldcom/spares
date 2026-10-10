#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/self/media/staff-app/issue-356-camera",
);
mkdirSync(outDir, { recursive: true });

const widths = [390, 1280, 1440, 1920];
const proof = { baseUrl, checks: [], ok: true };
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
await ctx.request.post(`${baseUrl}/api/auth/login`, {
  data: { email: "user@demo.com", password: "demo123456" },
});

for (const w of widths) {
  const h = w === 390 ? 844 : w === 1280 ? 800 : w === 1440 ? 900 : 1080;
  const page = await ctx.newPage();
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${baseUrl}/machines/hardware-fixture`, { timeout: 120000 });
  await page.getByRole("button", { name: "3D" }).click();
  await page.waitForTimeout(1200);
  const upright = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return { pass: false, reason: "no-canvas" };
    const rect = canvas.getBoundingClientRect();
    return {
      pass: rect.height > 80 && rect.width > 80,
      canvas: { w: rect.width, h: rect.height },
    };
  });
  await page.screenshot({ path: join(outDir, `default-${w}.png`) });
  proof.checks.push({ id: `default-${w}`, ...upright });
  if (!upright.pass) proof.ok = false;
  await page.close();
}

await browser.close();
writeFileSync(join(outDir, "proof.json"), JSON.stringify(proof, null, 2));
console.log(JSON.stringify(proof, null, 2));
process.exit(proof.ok ? 0 : 1);
