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
const customer = { email: "user@demo.com", password: "demo123456" };
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

async function loginContext(browser, account) {
  const context = await browser.newContext();
  const login = await context.request.post(`${baseUrl}/api/auth/login`, { data: account });
  if (!login.ok()) {
    await context.close();
    return null;
  }
  return context;
}

async function runFlow(browserType, label) {
  const browser = await browserType.launch({ headless: true });
  const staffCtx = await loginContext(browser, staff);
  if (!staffCtx) {
    await browser.close();
    return { label, ok: false, error: "staff login" };
  }
  const page = await staffCtx.newPage();
  await page.setViewportSize({ width: vp.width, height: vp.height });
  const cases = [];

  await page.goto(`${baseUrl}/staff/quotes`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.waitForTimeout(1200);
  const quoteLink = await firstUnreadQuoteLink(page);
  const listHadUnread =
    (await page.locator('a[href*="/staff/quotes/"]').filter({
      has: page.locator('[aria-label="Unread"]'),
    }).count()) > 0;
  await quoteLink.click({ timeout: 60000 });
  await page.locator("[data-conversation-sheet]").waitFor({ timeout: 60000 });
  await page.waitForTimeout(400);
  let probe = await sheetProbe(page);
  let verdict = expectUnreadPeek(probe, listHadUnread);
  const quoteShot = `${label}-unread-quote-open-${vp.key}.png`;
  await page.screenshot({ path: join(outDir, quoteShot), fullPage: false });
  cases.push({ flow: "unread-quote-open", ...probe, ...verdict, shot: quoteShot });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("[data-conversation-sheet]").waitFor({ timeout: 60000 });
  await page.waitForTimeout(700);
  probe = await sheetProbe(page);
  verdict = expectUnreadPeek(probe, false);
  const quoteReloadShot = `${label}-unread-quote-reload-${vp.key}.png`;
  await page.screenshot({ path: join(outDir, quoteReloadShot), fullPage: false });
  cases.push({
    flow: "unread-quote-reload",
    ...probe,
    ...verdict,
    shot: quoteReloadShot,
  });

  await staffCtx.close();

  const customerCtx = await loginContext(browser, customer);
  if (!customerCtx) {
    cases.push({ flow: "unread-care-open", pass: false, detail: "customer login" });
    await browser.close();
    const ok = cases.every((c) => c.pass);
    return { label, ok, cases };
  }
  const carePage = await customerCtx.newPage();
  await carePage.setViewportSize({ width: vp.width, height: vp.height });
  await carePage.goto(`${baseUrl}/care/tickets`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await carePage.waitForTimeout(1500);
  const careUnread = carePage.locator('a[href*="/care/tickets/"]').filter({
    has: carePage.locator('[aria-label="Unread"]'),
  });
  const careListHadUnread = (await careUnread.count()) > 0;
  const ticketLink = careListHadUnread ? careUnread.first() : carePage.locator('a[href*="/care/tickets/"]').first();
  if (await ticketLink.count()) {
    await ticketLink.click({ timeout: 60000 });
    await carePage.locator("[data-conversation-sheet]").waitFor({ timeout: 60000 });
    await carePage.waitForTimeout(400);
    probe = await sheetProbe(carePage);
    verdict = expectUnreadPeek(probe, careListHadUnread);
    const careShot = `${label}-unread-care-open-${vp.key}.png`;
    await carePage.screenshot({ path: join(outDir, careShot), fullPage: false });
    cases.push({
      flow: "unread-care-open",
      careListHadUnread,
      ...probe,
      ...verdict,
      shot: careShot,
    });
  } else {
    cases.push({ flow: "unread-care-open", pass: false, detail: "no ticket link" });
  }

  await customerCtx.close();
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
