#!/usr/bin/env node
/**
 * #389 — overlay Messages always peek on open (including unread); unread dot on toolbar.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, webkit } from "playwright";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/bc-7479d24f-d92e-51f0-ab53-0ec629d66015/media/staff-app/issue-389-messages-peek-default",
);
mkdirSync(outDir, { recursive: true });

const staff = { email: "staff@demo.com", password: "demo123456" };
const vp = { key: "390x844", width: 390, height: 844 };

async function sheetProbe(page) {
  return page.evaluate(() => {
    const card = document.querySelector("[data-conversation-sheet]");
    if (!card) {
      return { ok: false, reason: "no sheet" };
    }
    const snap = card.getAttribute("data-snap");
    const toolbar = card.querySelector(".conversation-sheet-toolbar");
    const unreadDot = card.querySelector(".conversation-sheet-unread-dot");
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
      toolbarVisible,
      composerHidden,
      unreadDotVisible: !!(
        unreadDot &&
        unreadDot.getBoundingClientRect().width > 0 &&
        getComputedStyle(unreadDot).opacity !== "0"
      ),
      sheetH: Math.round(cardBox.height),
      composerH: compBox ? Math.round(compBox.height) : 0,
      classes: card.className,
    };
  });
}

function expectUnreadPeek(probe, requireUnreadDot) {
  if (!probe.ok) return { pass: false, detail: probe.reason };
  const peekOk =
    probe.snap === "peek" && probe.toolbarVisible && probe.composerHidden;
  if (!peekOk) {
    return {
      pass: false,
      detail: `expected peek got snap=${probe.snap} composerH=${probe.composerH}`,
    };
  }
  if (requireUnreadDot && !probe.unreadDotVisible) {
    return { pass: false, detail: "expected unread dot on Messages toolbar" };
  }
  return { pass: true, detail: requireUnreadDot ? "peek + unread dot" : "peek" };
}

async function firstUnreadQuoteLink(page) {
  const unread = page.locator('a[href*="/staff/quotes/"]').filter({
    has: page.locator('[aria-label="Unread"]'),
  });
  if (await unread.count()) {
    return unread.first();
  }
  return page.locator('a[href*="/staff/quotes/"]').first();
}

async function firstUnreadTicketLink(page) {
  await page.goto(`${baseUrl}/care/tickets`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.waitForTimeout(1200);
  const rows = page.locator('a[href*="/care/tickets/"]');
  const count = await rows.count();
  for (let i = 0; i < Math.min(count, 40); i++) {
    const row = rows.nth(i);
    const text = (await row.innerText().catch(() => "")) || "";
    const hasUnread =
      (await row.locator("[data-unread], .is-unread, .ticket-unread").count()) > 0 ||
      /\bunread\b/i.test(text) ||
      (await row.locator(".conversation-sheet-unread-dot").count()) > 0;
    if (hasUnread) {
      return { row, hadUnreadMarker: true };
    }
  }
  return { row: rows.first(), hadUnreadMarker: false };
}

async function runFlow(browserType, label) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext();
  const login = await context.request.post(`${baseUrl}/api/auth/login`, { data: staff });
  if (!login.ok()) {
    await browser.close();
    return { label, ok: false, error: `login ${login.status()}` };
  }
  const page = await context.newPage();
  await page.setViewportSize({ width: vp.width, height: vp.height });
  const cases = [];

  await page.goto(`${baseUrl}/staff/quotes`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.waitForTimeout(1200);
  const quoteLink = await firstUnreadQuoteLink(page);
  await quoteLink.click({ timeout: 60000 });
  await page.locator("[data-conversation-sheet]").waitFor({ timeout: 60000 });
  await page.waitForTimeout(700);
  let probe = await sheetProbe(page);
  let verdict = expectUnreadPeek(probe, true);
  const quoteShot = `${label}-unread-quote-open-${vp.key}.png`;
  await page.screenshot({ path: join(outDir, quoteShot), fullPage: false });
  cases.push({ flow: "unread-quote-open", ...probe, ...verdict, shot: quoteShot });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("[data-conversation-sheet]").waitFor({ timeout: 60000 });
  await page.waitForTimeout(700);
  probe = await sheetProbe(page);
  verdict = expectUnreadPeek(probe, true);
  const quoteReloadShot = `${label}-unread-quote-reload-${vp.key}.png`;
  await page.screenshot({ path: join(outDir, quoteReloadShot), fullPage: false });
  cases.push({
    flow: "unread-quote-reload",
    ...probe,
    ...verdict,
    shot: quoteReloadShot,
  });

  const { row: ticketLink, hadUnreadMarker } = await firstUnreadTicketLink(page);
  if (await ticketLink.count()) {
    await ticketLink.click({ timeout: 60000 });
    await page.locator("[data-conversation-sheet]").waitFor({ timeout: 60000 });
    await page.waitForTimeout(700);
    probe = await sheetProbe(page);
    verdict = expectUnreadPeek(probe, probe.unreadDotVisible || hadUnreadMarker);
    const careShot = `${label}-unread-care-open-${vp.key}.png`;
    await page.screenshot({ path: join(outDir, careShot), fullPage: false });
    cases.push({
      flow: "unread-care-open",
      hadUnreadMarker,
      ...probe,
      ...verdict,
      shot: careShot,
    });
  } else {
    cases.push({ flow: "unread-care-open", pass: false, detail: "no ticket link" });
  }

  await browser.close();
  const ok = cases.every((c) => c.pass);
  return { label, ok, cases };
}

const results = [await runFlow(chromium, "chromium"), await runFlow(webkit, "webkit")];
const proof = {
  baseUrl,
  at: new Date().toISOString(),
  viewport: vp.key,
  results,
  ok: results.every((r) => r.ok),
};
writeFileSync(join(outDir, "proof-unread-peek.json"), JSON.stringify(proof, null, 2));
console.log(JSON.stringify(proof, null, 2));
process.exit(proof.ok ? 0 : 1);
