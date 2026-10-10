#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, devices } from "playwright";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const quoteRef = process.env.OEE360_QUOTE_REF || "29";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/self/media/staff-app/quote-message-bubbles",
);
mkdirSync(outDir, { recursive: true });

const proof = { baseUrl, quoteRef, checks: [], ok: true };
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
await ctx.request.post(`${baseUrl}/api/auth/login`, {
  data: { email: "staff@demo.com", password: "demo123456" },
});

for (const [w, h, name] of [
  [390, 844, "390-staff"],
  [1280, 800, "1280-staff"],
  [1440, 900, "1440-staff"],
  [1920, 1080, "1920-staff"],
]) {
  const page = await ctx.newPage();
  if (w === 390) {
    await page.setViewportSize({ width: w, height: h });
  } else {
    await page.setViewportSize({ width: w, height: h });
  }
  await page.goto(`${baseUrl}/staff/quotes/${quoteRef}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  if (w === 390) {
    await page.locator("[data-conversation-sheet]").waitFor({ timeout: 60000 });
  } else {
    await page.locator(".imsg-thread").first().waitFor({ timeout: 60000 });
  }
  await page.waitForTimeout(800);
  const bubbles = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".imsg-bubble")];
    return rows.map((bubble) => {
      const text = bubble.querySelector(".imsg-text");
      const textBox = text?.getBoundingClientRect();
      const bubbleBox = bubble.getBoundingClientRect();
      const textH = textBox?.height ?? 0;
      const bubbleH = bubbleBox.height;
      const ratio = textH > 0 ? bubbleH / textH : 1;
      return {
        snippet: (text?.textContent ?? "").slice(0, 40),
        bubbleH: Math.round(bubbleH),
        textH: Math.round(textH),
        ratio: Math.round(ratio * 100) / 100,
      };
    });
  });
  const worst = bubbles.reduce(
    (max, row) => (row.ratio > max.ratio ? row : max),
    { ratio: 0, bubbleH: 0, textH: 0, snippet: "" },
  );
  const pass = worst.ratio < 1.35 && worst.bubbleH < 120;
  proof.checks.push({ id: name, worst, pass, bubbleCount: bubbles.length });
  if (!pass) proof.ok = false;
  await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: w !== 390 });
  await page.close();
}

await browser.close();
writeFileSync(join(outDir, "proof.json"), JSON.stringify(proof, null, 2));
console.log(JSON.stringify(proof, null, 2));
process.exit(proof.ok ? 0 : 1);
