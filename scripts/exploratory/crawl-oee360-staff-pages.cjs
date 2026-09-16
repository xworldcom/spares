#!/usr/bin/env node
const fs = require("fs/promises");
const path = require("path");
const { chromium } = require("playwright");

const BASE = "https://oee360.com";
const EVID = path.resolve("docs/exploratory/evidence/crawl-20260916");
const EMAIL = process.env.OEE360_STAFF_EMAIL;
const PASS = process.env.OEE360_STAFF_PASSWORD;
if (!EMAIL || !PASS) {
  console.error("Set OEE360_STAFF_EMAIL and OEE360_STAFF_PASSWORD");
  process.exit(2);
}

async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASS);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(machines|staff|care|quotes)/, { timeout: 20000 });
}

async function shot(page, name) {
  const file = path.join(EVID, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function main() {
  await fs.mkdir(EVID, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const notes = [];
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();
  await signIn(page);

  const routes = [
    ["s01-staff-machines", "/machines"],
    ["s02-staff-quotes", "/staff/quotes"],
    ["s03-staff-quote-2", "/staff/quotes/2"],
    ["s04-staff-care", "/care"],
    ["s05-staff-directory", "/staff/directory"],
    ["s06-staff-directory-staff", "/staff/directory?type=staff"],
    ["s07-staff-directory-customers", "/staff/directory?type=customer"],
    ["s08-staff-directory-people", "/staff/directory?type=person"],
    ["s09-staff-service", "/machines/palletizer/care/service"],
    ["s10-staff-platform", "/staff/platform"],
    ["s11-staff-tenants", "/staff/tenants"],
    ["s12-staff-machine-new", "/machines/new"],
    ["s13-staff-bugs", "/staff/bugs"],
    ["s14-staff-accounts", "/staff/accounts"],
  ];
  for (const [name, href] of routes) {
    await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1400);
    await shot(page, name);
    const text = (await page.locator("body").innerText()).slice(0, 280);
    notes.push({ href, title: await page.title(), text, url: page.url() });
  }

  await page.goto(`${BASE}/staff/quotes/2`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const expand = page.locator('[aria-label="Expand conversation"]');
  if (await expand.count()) await expand.first().click({ timeout: 3000 }).catch(() => {});
  await shot(page, "s15-staff-quote-2-sheet");

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const m = await mobile.newPage();
  await signIn(m);
  await m.goto(`${BASE}/staff/quotes`, { waitUntil: "domcontentloaded" });
  await m.waitForTimeout(1000);
  const more = m.getByRole("button", { name: /^More$/ });
  notes.push({ more: await more.count() });
  if (await more.count()) {
    await more.click();
    await m.waitForTimeout(400);
    await shot(m, "s16-staff-more-menu");
    notes.push({
      moreLinks: await m.locator("a").evaluateAll((els) =>
        els.map((e) => ({ href: e.getAttribute("href"), text: e.textContent.trim() })).filter((x) => x.text),
      ),
    });
  }
  await m.goto(`${BASE}/staff/directory`, { waitUntil: "domcontentloaded" });
  await m.waitForTimeout(1000);
  await shot(m, "s17-staff-directory-mobile");

  await fs.writeFile(path.join(EVID, "staff-pages.json"), JSON.stringify(notes, null, 2));
  console.log(JSON.stringify(notes, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
