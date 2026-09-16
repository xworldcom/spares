#!/usr/bin/env node
const fs = require("fs/promises");
const path = require("path");
const { chromium } = require("playwright");

const BASE = process.env.OEE360_BASE_URL || "https://oee360.com";
const EVID =
  process.env.OEE360_EVIDENCE_DIR ||
  path.resolve("docs/exploratory/evidence/crawl-20260916-wide");
const STAFF_EMAIL = process.env.OEE360_STAFF_EMAIL;
const STAFF_PASS = process.env.OEE360_STAFF_PASSWORD;
const CUST_EMAIL = process.env.OEE360_CUST_A_EMAIL;
const CUST_PASS = process.env.OEE360_CUST_A_PASSWORD;

async function signIn(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  await page.locator("#email").waitFor({ timeout: 15000 });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(machines|quotes|staff|care)/, { timeout: 20000 });
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

  const cust = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await signIn(cust, CUST_EMAIL, CUST_PASS);

  await cust.goto(`${BASE}/quotes/2`, { waitUntil: "domcontentloaded" });
  await cust.getByRole("heading", { name: /Quote 2|Hardware fixture/i }).waitFor({ timeout: 20000 }).catch(() => {});
  await cust.waitForTimeout(1500);
  notes.push({ href: "/quotes/2", text: (await cust.locator("body").innerText()).slice(0, 500), file: await shot(cust, "u18-quote-2-wait") });
  const close = cust.locator('[aria-label="Collapse conversation"]');
  notes.push({ desktopCollapse: await close.count() });

  await cust.goto(`${BASE}/care/tickets/ac03a328-b1a4-42ee-860b-a92112f9ab35`, { waitUntil: "domcontentloaded" });
  await cust.waitForTimeout(6000);
  notes.push({ href: "/care/tickets/uuid", text: (await cust.locator("body").innerText()).slice(0, 500), file: await shot(cust, "u19-care-uuid-wait") });

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mc = await mobile.newPage();
  await signIn(mc, CUST_EMAIL, CUST_PASS);
  await mc.goto(`${BASE}/machines`, { waitUntil: "domcontentloaded" });
  await mc.waitForTimeout(4000);
  const more = mc.getByRole("button", { name: /^More$/ });
  notes.push({ mobileMore: await more.count() });
  if (await more.count()) {
    await more.click();
    await mc.waitForTimeout(400);
    await shot(mc, "u20-customer-more-wait");
  } else {
    await shot(mc, "u20-customer-mobile-no-more");
  }

  const staff = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await signIn(staff, STAFF_EMAIL, STAFF_PASS);
  await staff.goto(`${BASE}/staff/directory?type=customer`, { waitUntil: "domcontentloaded" });
  await staff.waitForTimeout(5000);
  const link = staff.locator('a[href^="/staff/directory/"]').first();
  notes.push({ personLinkCount: await staff.locator('a[href^="/staff/directory/"]').count() });
  if (await link.count()) {
    const href = await link.getAttribute("href");
    await link.click();
    await staff.waitForTimeout(3000);
    notes.push({ personHref: href, text: (await staff.locator("body").innerText()).slice(0, 500), file: await shot(staff, "w17-directory-person-drill") });
  } else {
    notes.push({ personHref: null, text: (await staff.locator("body").innerText()).slice(0, 400), file: await shot(staff, "w17-directory-no-links") });
  }

  await fs.writeFile(path.join(EVID, "ui-wait-notes.json"), JSON.stringify(notes, null, 2));
  console.log(JSON.stringify(notes, null, 2));
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
