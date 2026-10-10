#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const quoteRef = process.env.OEE360_QUOTE_REF || "29";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/self/media/staff-app/chat-messages-fix",
);
mkdirSync(outDir, { recursive: true });

const proof = {
  baseUrl,
  quoteRef,
  checks: [],
  ok: true,
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();

async function login(email, password) {
  await ctx.request.post(`${baseUrl}/api/auth/login`, {
    data: { email, password },
  });
}

await login("staff@demo.com", "demo123456");

for (const [w, h, name, path] of [
  [390, 844, "390-staff-quote", `/staff/quotes/${quoteRef}`],
  [1280, 800, "1280-staff-quote", `/staff/quotes/${quoteRef}`],
  [1440, 900, "1440-staff-quote", `/staff/quotes/${quoteRef}`],
  [1920, 1080, "1920-staff-quote", `/staff/quotes/${quoteRef}`],
  [390, 844, "390-customer-care", "/care/tickets/16"],
]) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: w, height: h });
  if (name.startsWith("390-customer")) {
    await login("user@demo.com", "demo123456");
  }
  await page.goto(`${baseUrl}${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  if (w === 390 && path.includes("quotes")) {
    await page.locator("[data-conversation-sheet]").waitFor({ timeout: 60000 });
  } else if (w === 390) {
    await page.locator("[data-care-ticket-detail]").waitFor({ timeout: 60000 });
  } else {
    await page.locator(".imsg-thread").first().waitFor({ timeout: 60000 });
  }
  await page.waitForTimeout(800);
  const metrics = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".imsg-row")];
    const bubbles = [...document.querySelectorAll(".imsg-bubble")];
    const tall = bubbles.filter((bubble) => {
      const text = bubble.querySelector(".imsg-text");
      const textH = text?.getBoundingClientRect().height ?? 0;
      const bubbleH = bubble.getBoundingClientRect().height;
      return textH > 0 && bubbleH / textH > 2.5;
    });
    const headerDup = document.querySelector(".care-ticket-detail")?.textContent?.trim() ?? "";
    return {
      rowCount: rows.length,
      bubbleCount: bubbles.length,
      tallBubbleCount: tall.length,
      ticketHeaderBlurb: headerDup,
    };
  });
  const pass = metrics.tallBubbleCount === 0 && !metrics.ticketHeaderBlurb;
  proof.checks.push({ id: name, metrics, pass });
  if (!pass) proof.ok = false;
  await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: w !== 390 });
  await page.close();
}

await browser.close();
writeFileSync(join(outDir, "proof.json"), JSON.stringify(proof, null, 2));
console.log(JSON.stringify(proof, null, 2));
process.exit(proof.ok ? 0 : 1);
