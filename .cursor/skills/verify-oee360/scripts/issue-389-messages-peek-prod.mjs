#!/usr/bin/env node
/**
 * #389 — Messages overlay sheet rests at peek on quote/care open (composer hidden).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, webkit, devices } from "playwright";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/bc-7479d24f-d92e-51f0-ab53-0ec629d66015/media/staff-app/issue-389-messages-peek-default",
);
mkdirSync(outDir, { recursive: true });

const staff = { email: "staff@demo.com", password: "demo123456" };

const viewports = [
  { key: "390x844", width: 390, height: 844, overlay: true },
  { key: "820x1180", width: 820, height: 1180, overlay: true },
  { key: "1440x900", width: 1440, height: 900, overlay: false },
];

async function sheetProbe(page) {
  return page.evaluate(() => {
    const card = document.querySelector("[data-conversation-sheet]");
    if (!card) {
      return { ok: false, reason: "no sheet" };
    }
    const snap = card.getAttribute("data-snap");
    const inline = card.classList.contains("is-inline");
    const toolbar = card.querySelector(".conversation-sheet-toolbar");
    const composer = card.querySelector(".imsg-composer");
    const toolbarBox = toolbar?.getBoundingClientRect();
    const compBox = composer?.getBoundingClientRect();
    const compStyle = composer ? getComputedStyle(composer) : null;
    const composerHidden =
      !compBox ||
      compBox.height < 2 ||
      Number.parseFloat(compStyle?.opacity || "1") < 0.05;
    const toolbarVisible = !!(toolbarBox && toolbarBox.height > 4);
    const cardBox = card.getBoundingClientRect();
    return {
      ok: true,
      snap,
      inline,
      toolbarVisible,
      composerHidden,
      sheetH: Math.round(cardBox.height),
      composerH: compBox ? Math.round(compBox.height) : 0,
      classes: card.className,
    };
  });
}

function expectPeek(probe, viewport) {
  if (!probe.ok) return { pass: false, detail: probe.reason };
  if (viewport.overlay) {
    const pass =
      probe.snap === "peek" && probe.toolbarVisible && probe.composerHidden;
    return {
      pass,
      detail: pass
        ? "peek overlay"
        : `expected peek toolbar-only got snap=${probe.snap} composerH=${probe.composerH}`,
    };
  }
  const pass = probe.inline && probe.snap === "reply";
  return {
    pass,
    detail: pass
      ? "desktop inline reply column"
      : `expected inline reply got snap=${probe.snap} inline=${probe.inline}`,
  };
}

async function runBrowser(browserType, label) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext();
  const login = await context.request.post(`${baseUrl}/api/auth/login`, {
    data: staff,
  });
  if (!login.ok()) {
    await browser.close();
    return { label, ok: false, error: `login ${login.status()}` };
  }
  const page = await context.newPage();
  const cases = [];

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });

    await page.goto(`${baseUrl}/staff/quotes`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await page.waitForTimeout(1200);
    const quoteLink = page.locator('a[href*="/staff/quotes/"]').first();
    await quoteLink.click({ timeout: 60000 });
    await page.locator("[data-conversation-sheet]").waitFor({ timeout: 60000 });
    await page.waitForTimeout(600);
    let probe = await sheetProbe(page);
    let verdict = expectPeek(probe, vp);
    const quoteShot = `${label}-staff-quote-open-${vp.key}.png`;
    await page.screenshot({ path: join(outDir, quoteShot), fullPage: false });
    cases.push({ flow: "quote-nav", viewport: vp.key, ...probe, ...verdict, shot: quoteShot });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("[data-conversation-sheet]").waitFor({ timeout: 60000 });
    await page.waitForTimeout(600);
    probe = await sheetProbe(page);
    verdict = expectPeek(probe, vp);
    const quoteReloadShot = `${label}-staff-quote-reload-${vp.key}.png`;
    await page.screenshot({ path: join(outDir, quoteReloadShot), fullPage: false });
    cases.push({
      flow: "quote-reload",
      viewport: vp.key,
      ...probe,
      ...verdict,
      shot: quoteReloadShot,
    });

    await page.goto(`${baseUrl}/staff/tickets`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await page.waitForTimeout(1200);
    const ticketLink = page.locator('a[href*="/staff/tickets/"]').first();
    if (await ticketLink.count()) {
      await ticketLink.click({ timeout: 60000 });
      await page.locator("[data-conversation-sheet]").waitFor({ timeout: 60000 });
      await page.waitForTimeout(600);
      probe = await sheetProbe(page);
      verdict = expectPeek(probe, vp);
      const careShot = `${label}-staff-ticket-open-${vp.key}.png`;
      await page.screenshot({ path: join(outDir, careShot), fullPage: false });
      cases.push({
        flow: "care-nav",
        viewport: vp.key,
        ...probe,
        ...verdict,
        shot: careShot,
      });
    } else {
      cases.push({
        flow: "care-nav",
        viewport: vp.key,
        pass: false,
        detail: "no ticket link",
      });
    }
  }

  await browser.close();
  const ok = cases.every((c) => c.pass);
  return { label, ok, cases };
}

const results = [];
results.push(await runBrowser(chromium, "chromium"));
results.push(await runBrowser(webkit, "webkit"));

const proof = { baseUrl, at: new Date().toISOString(), results, ok: results.every((r) => r.ok) };
writeFileSync(join(outDir, "proof.json"), JSON.stringify(proof, null, 2));
console.log(JSON.stringify(proof, null, 2));
process.exit(proof.ok ? 0 : 1);
