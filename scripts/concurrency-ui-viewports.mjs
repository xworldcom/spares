#!/usr/bin/env node
/**
 * Quote detail smoke @ 1440 and 390 on preview/prod (login + screenshot).
 * Env: OEE360_BASE_URL, OEE360_EVIDENCE_DIR
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/self/media/staff-app/concurrency-migration",
);
mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "phone-390", width: 390, height: 844 },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const result = { baseUrl, at: new Date().toISOString(), shots: [], ok: false };
  try {
    for (const vp of viewports) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        baseURL: baseUrl,
      });
      const page = await context.newPage();
      await page.goto("/login");
      await page.getByLabel("Email").fill("staff@demo.com");
      await page.getByLabel("Password").fill("demo123456");
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL(/\/(staff\/)?quotes|machines/, { timeout: 60_000 });
      await page.goto("/staff/quotes");
      await page.waitForSelector(".quote-workspace, [data-quote-layout]", {
        timeout: 60_000,
      }).catch(() => undefined);
      const link = page.locator('a[href*="/staff/quotes/"]').first();
      if (await link.count()) {
        await link.click();
        await page.waitForSelector(".quote-workspace", { timeout: 60_000 });
      }
      const path = `${outDir}/ui-${vp.name}.png`;
      await page.screenshot({ path, fullPage: true });
      result.shots.push({ viewport: vp.name, path });
      await context.close();
    }
    result.ok = result.shots.length === viewports.length;
  } finally {
    await browser.close();
  }
  writeFileSync(`${outDir}/ui-viewports.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
