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
if (!STAFF_EMAIL || !STAFF_PASS || !CUST_EMAIL || !CUST_PASS) {
  console.error("Set OEE360_STAFF_EMAIL/PASSWORD and OEE360_CUST_A_EMAIL/PASSWORD");
  process.exit(2);
}

const findings = [];
const coverage = [];
const notes = [];

function cover(level, feature, result, note) {
  coverage.push({ level, feature, result, note });
}

function find(severity, id, title, extra) {
  findings.push({ severity, id, title, ...extra });
}

async function shot(page, name) {
  await fs.mkdir(EVID, { recursive: true });
  const file = path.join(EVID, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function signIn(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  await page.locator("#email").waitFor({ timeout: 15000 });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(machines|quotes|staff|care)/, { timeout: 20000 });
}

async function bodyText(page) {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 400);
}

async function openRoute(page, href, waitMs = 2500) {
  await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(waitMs);
}

async function main() {
  await fs.mkdir(EVID, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  const loginPage = await browser.newPage();
  await loginPage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await loginPage.waitForTimeout(1500);
  await shot(loginPage, "u00-login");
  await loginPage.locator("#email").fill("nobody@spares.test");
  await loginPage.locator("#password").fill("WrongPass!1");
  await loginPage.getByRole("button", { name: "Sign in" }).click();
  await loginPage.waitForTimeout(1500);
  const loginErr = await bodyText(loginPage);
  cover("anon", "bad login", /invalid|incorrect|failed|wrong|not/i.test(loginErr) ? "ok" : "fail", loginErr);
  await shot(loginPage, "u00b-login-error");
  await loginPage.close();

  const custCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const cust = await custCtx.newPage();
  await signIn(cust, CUST_EMAIL, CUST_PASS);

  const customerRoutes = [
    ["u01-machines", "/machines", 1600],
    ["u02-machine-hw", "/machines/hardware-fixture", 2000],
    ["u03-care-hub", "/care", 2000],
    ["u04-care-tickets", "/care/tickets", 2200],
    ["u05-care-ticket-number", "/care/tickets/5", 2800],
    ["u06-care-ticket-uuid", "/care/tickets/ac03a328-b1a4-42ee-860b-a92112f9ab35", 2800],
    ["u07-machine-ticket-number", "/machines/palletizer/care/tickets/5", 2800],
    ["u08-quotes", "/quotes", 1800],
    ["u09-quote-2", "/quotes/2", 2500],
    ["u10-quote-3", "/quotes/3", 2500],
    ["u11-care-service-cust", "/machines/palletizer/care/service", 2200],
    ["u12-care-manuals", "/machines/palletizer/care/manuals", 1800],
  ];
  for (const [name, href, wait] of customerRoutes) {
    await openRoute(cust, href, wait);
    const text = await bodyText(cust);
    const file = await shot(cust, name);
    notes.push({ role: "customer", href, url: cust.url(), text, file });
    const loading = /Loading…|Loading ticket|Checking your session/i.test(text) && !/Ticket 5|Palletizer|Hardware|Quote/i.test(text);
    cover("customer", href, loading ? "fail" : "ok", text.slice(0, 160));
  }

  const numText = notes.find((n) => n.href === "/care/tickets/5")?.text || "";
  const uuidText = notes.find((n) => n.href.includes("ac03a328"))?.text || "";
  const numEmpty =
    /Loading conversation|Select a ticket/i.test(numText) ||
    (!/Crawl A palletizer|Ticket 5/i.test(numText) && /Notes|Tickets/i.test(numText));
  const uuidHasThread = /Crawl A palletizer|Ticket 5|Notes/i.test(uuidText);
  cover("customer", "care numeric URL sheet", numEmpty ? "fail" : "ok", numText.slice(0, 180));
  cover("customer", "care UUID URL sheet", uuidHasThread ? "ok" : "fail", uuidText.slice(0, 180));
  if (numEmpty && uuidHasThread) {
    find("major", "care-numeric-url-empty-sheet", "Numeric Care URL leaves the sheet empty while UUID works", {
      steps: ["Sign in as customer A", "Open /care/tickets/5", "Compare /care/tickets/<uuid>"],
      expected: "Ticket 5 title and notes",
      actual: numText.slice(0, 240),
    });
  }

  await openRoute(cust, "/quotes/2", 2500);
  const closeBtn = cust.locator('[aria-label="Collapse conversation"]');
  const closeCount = await closeBtn.count();
  cover("customer", "desktop collapse control", closeCount > 0 ? "ok" : "fail", `count=${closeCount}`);
  if (closeCount === 0) {
    find("major", "desktop-collapse-missing", "Desktop overlay sheet has no Collapse conversation control", {
      steps: ["Customer /quotes/2 at 1440px"],
      expected: "× or Collapse conversation",
      actual: "no aria-label Collapse conversation",
    });
  } else {
    try {
      await closeBtn.first().click({ timeout: 4000 });
      await cust.waitForTimeout(600);
      await shot(cust, "u13-quote-2-after-collapse");
      cover("customer", "desktop collapse click", "ok", "clicked");
    } catch (err) {
      find("major", "desktop-collapse-click", "Collapse conversation click failed", {
        actual: err.message,
      });
      cover("customer", "desktop collapse click", "fail", err.message);
    }
  }

  const mobileCust = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mc = await mobileCust.newPage();
  await signIn(mc, CUST_EMAIL, CUST_PASS);
  await openRoute(mc, "/machines", 1600);
  await shot(mc, "u14-machines-mobile");
  const more = mc.getByRole("button", { name: /^More$/ });
  cover("customer", "mobile More", (await more.count()) > 0 ? "ok" : "fail", String(await more.count()));
  if (await more.count()) {
    await more.click();
    await mc.waitForTimeout(400);
    await shot(mc, "u15-customer-more");
  }
  await openRoute(mc, "/care/tickets/5", 2500);
  await shot(mc, "u16-care-5-mobile");
  await openRoute(mc, "/quotes/2", 2500);
  await shot(mc, "u17-quote-2-mobile");
  const mClose = mc.locator('[aria-label="Collapse conversation"]');
  cover("customer", "mobile collapse control", (await mClose.count()) > 0 ? "ok" : "fail", String(await mClose.count()));

  const staffCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const staff = await staffCtx.newPage();
  await signIn(staff, STAFF_EMAIL, STAFF_PASS);

  let personHref = "/staff/directory";
  await openRoute(staff, "/staff/directory?type=customer", 3500);
  const firstPerson = staff.locator('a[href^="/staff/directory/"]').first();
  if (await firstPerson.count()) {
    personHref = (await firstPerson.getAttribute("href")) || personHref;
  }
  const staffRoutes = [
    ["w01-directory", "/staff/directory", 3500],
    ["w02-directory-person", personHref, 3500],
    ["w03-team", "/staff/team", 3000],
    ["w04-people", "/staff/people", 3000],
    ["w05-customers", "/staff/customers", 3000],
    ["w06-accounts", "/staff/accounts", 3000],
    ["w07-tickets", "/staff/tickets", 3000],
    ["w08-service", "/machines/palletizer/care/service", 4000],
    ["w09-new-machine", "/machines/new", 4000],
    ["w10-tenants", "/staff/tenants", 2500],
    ["w11-platform", "/staff/platform", 2500],
    ["w12-bugs", "/staff/bugs", 2500],
    ["w13-quote-2", "/staff/quotes/2", 3000],
    ["w14-care-5", "/care/tickets/5", 3000],
  ];
  for (const [name, href, wait] of staffRoutes) {
    await openRoute(staff, href, wait);
    const text = await bodyText(staff);
    const file = await shot(staff, name);
    notes.push({ role: "staff", href, url: staff.url(), text, file });
    const stuck = /Checking your session|Loading directory|Loading quote/i.test(text) && text.length < 220;
    cover("staff", href, stuck ? "fail" : "ok", text.slice(0, 160));
  }

  const staffMobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const sm = await staffMobile.newPage();
  await signIn(sm, STAFF_EMAIL, STAFF_PASS);
  await openRoute(sm, "/staff/directory", 3000);
  await shot(sm, "w15-directory-mobile");
  const moreStaff = sm.getByRole("button", { name: /^More$/ });
  if (await moreStaff.count()) {
    await moreStaff.click();
    await sm.waitForTimeout(400);
    await shot(sm, "w16-staff-more");
    const moreText = await bodyText(sm);
    cover("staff", "mobile More hides Platform", /Platform/i.test(moreText) ? "fail" : "ok", moreText.slice(0, 180));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    personHref,
    findingCounts: findings.reduce((acc, f) => {
      acc[f.severity] = (acc[f.severity] || 0) + 1;
      return acc;
    }, {}),
    findings,
    coverage,
    notes,
  };
  await fs.writeFile(path.join(EVID, "ui-wide-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
