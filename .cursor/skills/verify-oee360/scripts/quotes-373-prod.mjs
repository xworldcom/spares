#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/bc-7479d24f-d92e-51f0-ab53-0ec629d66015/media/staff-app/quotes-373-prod",
);
mkdirSync(outDir, { recursive: true });

const proof = {
  baseUrl,
  expectedSha: process.env.OEE360_EXPECTED_SHA || "",
  checks: [],
  ok: true,
};

function check(name, pass, detail) {
  proof.checks.push({ name, pass, detail });
  if (!pass) proof.ok = false;
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();

async function login(email, password) {
  await ctx.request.post(`${baseUrl}/api/auth/login`, {
    data: { email, password },
  });
}

await login("staff@demo.com", "demo123456");

async function staffQuoteProbe(viewport, label, quoteRef, coldLoad = false) {
  const page = await ctx.newPage();
  await page.setViewportSize(viewport);
  if (coldLoad) {
    await page.goto(`${baseUrl}/staff/quotes`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await page.waitForTimeout(500);
  }
  const t0 = Date.now();
  await page.goto(`${baseUrl}/staff/quotes/${quoteRef}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.locator("h1").first().waitFor({ timeout: 120000 });
  let messagesReadyMs = null;
  try {
    await page
      .locator(".imsg-thread .imsg-row, .imsg-thread .imsg-system")
      .first()
      .waitFor({ timeout: 15000 });
    messagesReadyMs = Date.now() - t0;
  } catch {
    messagesReadyMs = null;
  }
  const cancelVisible = await page
    .getByRole("button", { name: "Cancel quote" })
    .isVisible()
    .catch(() => false);
  const lifecycleSummary = await page
    .locator('[data-staff-quote-line-lifecycle-mode="summary"]')
    .count();
  const lifecycleEdit = await page.getByRole("button", { name: "Edit" }).count();
  await page.screenshot({
    path: `${outDir}/${label}-quote-${quoteRef}.png`,
    fullPage: false,
  });
  await page.close();
  return { cancelVisible, messagesReadyMs, lifecycleSummary, lifecycleEdit };
}

for (const [w, h, label] of [
  [390, 844, "390"],
  [1280, 800, "1280"],
]) {
  const closed = await staffQuoteProbe({ width: w, height: h }, label, "2", true);
  check(
    `${label}: closed quote 2 hides Cancel quote`,
    !closed.cancelVisible,
    { cancelVisible: closed.cancelVisible },
  );
  check(
    `${label}: Q2 messages thread within 15s`,
    closed.messagesReadyMs != null && closed.messagesReadyMs < 15000,
    { messagesReadyMs: closed.messagesReadyMs },
  );
  check(
    `${label}: lifecycle compact summary on quote 2`,
    closed.lifecycleSummary > 0 && closed.lifecycleEdit > 0,
    closed,
  );
}

const listPage = await ctx.newPage();
await listPage.setViewportSize({ width: 1280, height: 800 });
await listPage.goto(`${baseUrl}/staff/quotes`, {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await listPage.waitForTimeout(2000);
const demoStageNotes = await listPage.evaluate(() => {
  const text = document.body.innerText;
  return {
    po: /Demo verify — PO received/.test(text),
    confirmed: /Demo verify — Confirmed/.test(text),
    ordered: /Demo verify — Ordered/.test(text),
    shipped: /Demo verify — Shipped/.test(text),
  };
});
await listPage.screenshot({ path: `${outDir}/1280-quotes-list.png` });
await listPage.close();

const stageCount = Object.values(demoStageNotes).filter(Boolean).length;
check(
  "demo stage quotes visible on prod list (seed env only)",
  stageCount >= 1 || process.env.OEE360_ALLOW_NO_DEMO_SEEDS === "1",
  { demoStageNotes, stageCount, note: "Prod has SPARES_ALLOW_SEED off; pass if at least one seed quote or ALLOW flag" },
);
if (stageCount === 0 && process.env.OEE360_ALLOW_NO_DEMO_SEEDS !== "1") {
  const alt = await (async () => {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: 1280, height: 800 });
    await p.goto(`${baseUrl}/staff/quotes/27`, { waitUntil: "domcontentloaded" });
    await p.locator("h1").waitFor({ timeout: 60000 });
    const po = await p.locator("text=PO").count();
    const tracking = await p.getByText(/tracking/i).count();
    await p.close();
    return { poSection: po > 0, trackingMention: tracking > 0 };
  })();
  check("prod stage-gate fallback quote 27 (quoted → PO section)", alt.poSection, alt);
}

await browser.close();
writeFileSync(`${outDir}/proof.json`, JSON.stringify(proof, null, 2));
console.log(JSON.stringify(proof, null, 2));
process.exit(proof.ok ? 0 : 1);
