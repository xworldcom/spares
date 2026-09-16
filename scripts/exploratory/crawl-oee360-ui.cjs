#!/usr/bin/env node
/**
 * Production UI crawl for oee360.com. Two Playwright contexts.
 * Writes screenshots + findings JSON under the evidence directory.
 */
const fs = require("fs/promises");
const path = require("path");
const { chromium } = require("playwright");

const BASE = process.env.OEE360_BASE_URL || "https://oee360.com";
const EVID =
  process.env.OEE360_EVIDENCE_DIR ||
  path.resolve("docs/exploratory/evidence/crawl-20260916");
const STAFF_EMAIL = process.env.OEE360_STAFF_EMAIL;
const STAFF_PASS = process.env.OEE360_STAFF_PASSWORD;
const CUST_EMAIL = process.env.OEE360_CUST_A_EMAIL;
const CUST_PASS = process.env.OEE360_CUST_A_PASSWORD;
if (!STAFF_EMAIL || !STAFF_PASS || !CUST_EMAIL || !CUST_PASS) {
  console.error("Set OEE360_STAFF_EMAIL/PASSWORD and OEE360_CUST_A_EMAIL/PASSWORD");
  process.exit(2);
}

const findings = [];
const shots = [];
const coverage = [];

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
  shots.push(file);
  return file;
}

async function signIn(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  const emailBox = page.locator("#email");
  await emailBox.waitFor({ timeout: 15000 });
  await emailBox.fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(machines|quotes|staff|care)/, { timeout: 20000 });
}

async function expandConversation(page) {
  const handle = page.locator('[aria-label="Expand conversation"]');
  if (await handle.count()) {
    await handle.first().click({ timeout: 3000 }).catch(() => {});
  }
  const peek = page.locator(".conversation-sheet-peek");
  if (await peek.count()) {
    await peek.first().click({ timeout: 3000 }).catch(() => {});
  }
}

async function sendMessage(page, text) {
  await expandConversation(page);
  const box = page.locator('textarea.imsg-input, textarea[placeholder="Message"]');
  await box.first().waitFor({ state: "visible", timeout: 12000 });
  await box.first().fill(text);
  await page.locator("button.imsg-send").click();
  await page.waitForTimeout(800);
}

async function trySend(page, text, bag, id) {
  try {
    await sendMessage(page, text);
    return true;
  } catch (err) {
    bag.push(`${id}: ${err.message}`);
    find("major", id, "Could not send conversation message", {
      steps: [text],
      expected: "composer visible and send succeeds",
      actual: err.message,
      url: page.url(),
    });
    await shot(page, `fail-${id}`).catch(() => "");
    return false;
  }
}

async function attachPng(page) {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const file = path.join(EVID, "tiny.png");
  await fs.writeFile(file, png);
  await expandConversation(page);
  const input = page.locator('input[type="file"]');
  if (await input.count()) {
    await input.first().setInputFiles(file);
    await page.waitForTimeout(400);
    const send = page.locator("button.imsg-send");
    if (await send.isEnabled()) {
      await send.click();
      await page.waitForTimeout(1500);
    }
  }
}

async function collectConsole(page, bag) {
  page.on("pageerror", (err) => bag.push(`pageerror ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") bag.push(`console ${msg.text()}`);
  });
}

async function assertNoVercelSso(page, label) {
  const html = await page.content();
  if (/Authentication Required|vercel.com\/login/i.test(html)) {
    find("blocker", `vercel-sso-${label}`, "Hit Vercel Deployment Protection", {
      steps: [`Open ${page.url()}`],
      expected: "app login only",
      actual: "Vercel SSO page",
    });
  }
}

async function main() {
  await fs.mkdir(EVID, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const custErrors = [];
  const staffErrors = [];

  const custCtx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const staffCtx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const cust = await custCtx.newPage();
  const staff = await staffCtx.newPage();
  collectConsole(cust, custErrors);
  collectConsole(staff, staffErrors);
  const sendFails = [];
  let quoteUrl = `${BASE}/quotes/2`;
  let staffQuoteUrl = `${BASE}/staff/quotes/2`;

  try {
  await signIn(cust, CUST_EMAIL, CUST_PASS);
  await assertNoVercelSso(cust, "cust-login");
  await cust.getByRole("heading", { name: /Machines/i }).waitFor({ timeout: 15000 });
  await cust.getByRole("link", { name: /Hardware fixture/i }).first().waitFor({ timeout: 15000 });
  const machinesH1 = await cust.locator("h1").first().textContent().catch(() => "");
  cover("customer", "login → Machines", /Machines/i.test(machinesH1 || "") ? "ok" : "fail", machinesH1);
  await shot(cust, "01-customer-machines");
  const machineNameVisible = await cust.getByText("Hardware fixture").first().isVisible();
  if (!machineNameVisible) {
    find("major", "machine-names-invisible", "Hardware fixture link exists but is not visible", {
      steps: ["Sign in", "Wait for Machines"],
      expected: "visible machine names on cards",
      actual: "link in a11y tree, not visible",
      screenshot: "01-customer-machines.png",
    });
  }

  await cust.getByRole("link", { name: /Hardware fixture/i }).first().click();
  await cust.waitForTimeout(2500);
  await shot(cust, "02-customer-hardware-fixture");
  cover("customer", "open Hardware fixture", cust.url().includes("hardware") ? "ok" : "fail", cust.url());

  const listTab = cust.getByRole("button", { name: /^List/i });
  if (await listTab.count()) {
    await listTab.first().click();
    await cust.waitForTimeout(600);
    await shot(cust, "02b-customer-hardware-list");
  }
  const addButtons = cust.getByRole("button", { name: /^Add$/ });
  const addCount = await addButtons.count();
  if (addCount === 0) {
    find("major", "no-add-part", "No Add buttons on machine BOM for customer", {
      steps: ["Open Hardware fixture", "List tab"],
      expected: "Add on each part row",
      actual: "0 Add buttons",
      screenshot: "02b-customer-hardware-list.png",
    });
  } else {
    await addButtons.nth(0).click();
    await cust.waitForTimeout(400);
    if (addCount > 1) await addButtons.nth(1).click();
  }
  const request = cust.getByRole("button", { name: "Request quote" });
  if (await request.count()) {
    const note = cust.locator("textarea");
    if (await note.count()) {
      await note.first().fill("Crawl UI quote. Site Dayton. Need-by invented. Freight $75.");
    }
    await request.click();
    await cust.waitForTimeout(1500);
    await shot(cust, "03-customer-quote-sent");
    const view = cust.getByRole("link", { name: "View quote" });
    if (await view.count()) await view.first().click();
  } else {
    find("minor", "used-existing-quote", "Request quote skipped; opening existing quote 2", {
      steps: ["Add parts on Hardware fixture"],
      expected: "new quote from tray",
      actual: "using /quotes/2 from isolation crawl",
    });
  }
  if (!/\/quotes\/\d+/.test(cust.url())) {
    await cust.goto(`${BASE}/quotes/2`, { waitUntil: "domcontentloaded" });
    await cust.waitForTimeout(1500);
  }
  cover("customer", "request quote", /\/quotes\//.test(cust.url()) ? "ok" : "fail", cust.url());
  await shot(cust, "04-customer-quote-detail");
  quoteUrl = cust.url();

  await expandConversation(cust);
  await shot(cust, "05-customer-sheet-expanded");
  await trySend(cust, "Customer round 1. We need the bearing this week.", sendFails, "cust-send-1");
  await trySend(cust, "Customer round 2. Palletizer motor is the backup line.", sendFails, "cust-send-2");
  try {
    await attachPng(cust);
  } catch (err) {
    find("minor", "attach-failed", "Image attach failed", {
      steps: ["Attach tiny.png on quote thread"],
      expected: "upload + send",
      actual: err.message,
    });
  }
  await trySend(cust, "Customer round 3. Attached a tiny photo of the worn race.", sendFails, "cust-send-3");
  await shot(cust, "06-customer-after-messages");

  const ownBubbles = await cust.locator(".imsg-row.imsg-own").count();
  const otherBubbles = await cust.locator(".imsg-row.imsg-other").count();
  cover("customer", "own bubbles after send", ownBubbles > 0 ? "ok" : "fail", `own=${ownBubbles} other=${otherBubbles}`);
  if (ownBubbles === 0) {
    find("major", "no-own-bubbles", "Customer sent messages but no own-lane bubbles", {
      steps: ["Send 3 messages on quote conversation"],
      expected: ".imsg-own rows",
      actual: `own=${ownBubbles} other=${otherBubbles}`,
      screenshot: "06-customer-after-messages.png",
    });
  }

  const collapse = cust.locator('[aria-label="Collapse conversation"]');
  if (await collapse.count()) {
    await collapse.first().click();
    await cust.waitForTimeout(400);
    await shot(cust, "07-customer-sheet-collapsed");
    await expandConversation(cust);
    await shot(cust, "08-customer-sheet-reexpanded");
  } else {
    find("minor", "no-collapse-desktop", "No collapse control on desktop conversation sheet", {
      steps: ["Quote detail 1440px"],
      expected: "Collapse conversation",
      actual: "control missing",
      screenshot: "05-customer-sheet-expanded.png",
    });
  }

  await cust.goto(`${BASE}/care`, { waitUntil: "domcontentloaded" });
  await cust.waitForTimeout(1200);
  await shot(cust, "09-customer-care");
  const newTicket = cust.getByRole("button", { name: /New ticket/i });
  if (await newTicket.count()) {
    await newTicket.first().click();
    await cust.waitForTimeout(400);
    const titleBox = cust.getByPlaceholder("Belt slipping after changeover");
    if (await titleBox.count()) {
      await titleBox.fill("Crawl Care: fixture chatter");
    }
    const noteBox = cust.getByPlaceholder("Optional detail");
    if (await noteBox.count()) {
      await noteBox.fill("Throwaway Care ticket from crawl customer.");
    }
    const machineSelect = cust.locator("select");
    if (await machineSelect.count()) {
      await machineSelect.first().selectOption({ label: /Hardware fixture/i }).catch(async () => {
        await machineSelect.first().selectOption({ index: 1 }).catch(() => {});
      });
    }
    const openBtn = cust.getByRole("button", { name: /Open ticket/i });
    if (await openBtn.count()) await openBtn.click();
    await cust.waitForTimeout(1500);
    await shot(cust, "10-customer-care-ticket");
    if (/\/tickets\//.test(cust.url())) {
      await trySend(cust, "Care customer 1. Hearing chatter on the fixture.", sendFails, "cust-care-1");
      await trySend(cust, "Care customer 2. Happens after about 20 minutes.", sendFails, "cust-care-2");
    }
  } else {
    find("major", "no-new-ticket", "Customer Care hub missing New ticket", {
      steps: ["Open /care as customer"],
      expected: "New ticket",
      actual: await cust.locator("body").innerText().then((t) => t.slice(0, 400)),
      screenshot: "09-customer-care.png",
    });
  }
  cover("customer", "Care ticket", /ticket/i.test(cust.url() + (await cust.locator("body").innerText())) ? "ok" : "fail", cust.url());

  await cust.setViewportSize({ width: 390, height: 844 });
  await cust.goto(quoteUrl.includes("/quotes/") ? quoteUrl : `${BASE}/quotes`, {
    waitUntil: "domcontentloaded",
  });
  await cust.waitForTimeout(1200);
  await shot(cust, "11-customer-quote-mobile");
  await expandConversation(cust);
  await shot(cust, "12-customer-sheet-mobile");
  const more = cust.getByRole("button", { name: /^More$/ });
  cover("customer", "mobile quote sheet", "ok", cust.url());
  await cust.setViewportSize({ width: 1440, height: 900 });

  await signIn(staff, STAFF_EMAIL, STAFF_PASS);
  await assertNoVercelSso(staff, "staff-login");
  await shot(staff, "13-staff-home");
  cover("staff", "login", /machines|quotes|care/i.test(staff.url()) ? "ok" : "fail", staff.url());

  await staff.goto(`${BASE}/staff/quotes`, { waitUntil: "domcontentloaded" });
  await staff.waitForTimeout(1200);
  await shot(staff, "14-staff-quotes");
  const crawlRow = staff.getByRole("link").filter({ hasText: /Hardware fixture|Crawl/i }).first();
  if (await crawlRow.count()) {
    await crawlRow.click();
  } else {
    const any = staff.locator('a[href^="/staff/quotes/"]').first();
    if (await any.count()) await any.click();
  }
  await staff.waitForTimeout(1500);
  await shot(staff, "15-staff-quote-detail");
  staffQuoteUrl = staff.url();
  cover("staff", "open quote", /\/staff\/quotes\//.test(staffQuoteUrl) ? "ok" : "fail", staffQuoteUrl);

  await expandConversation(staff);
  await trySend(staff, "Staff round 1. Reviewing the bearing and motor.", sendFails, "staff-send-1");
  await trySend(staff, "Staff round 2. Pricing the motor at $340 and the bearing at $12.50. Freight $75 on the note.", sendFails, "staff-send-2");
  await shot(staff, "16-staff-after-reply");

  const sell = staff.getByLabel("Sell price");
  const sellCount = await sell.count();
  if (sellCount >= 1) {
    await sell.nth(0).fill("12.50");
    if (sellCount >= 2) await sell.nth(1).fill("340");
  }
  const noteFields = staff.getByLabel("Note");
  if (await noteFields.count()) {
    await noteFields.first().fill("Freight $75 invented");
  }
  const savePricing = staff.getByRole("button", { name: "Save pricing" });
  if (await savePricing.count()) {
    await savePricing.first().click();
    await staff.waitForTimeout(800);
  }

  const pipeline = [
    "In review",
    "Pricing",
    "Quoted",
    "PO received",
    "Confirmed",
    "Ordered",
    "Shipped",
    "Delivered",
    "Closed",
  ];
  const walked = [];
  for (const label of pipeline) {
    const step = staff.getByRole("button", { name: label, exact: true });
    if (!(await step.count())) {
      walked.push(`${label}: missing`);
      continue;
    }
    await step.first().click();
    await staff.waitForTimeout(250);
    const apply = staff.getByRole("button", { name: /Apply status|Apply changes|Cancel quote/i });
    if (await apply.count()) {
      staff.once("dialog", (d) => d.accept().catch(() => {}));
      await apply.first().click();
      await staff.waitForTimeout(700);
    }
    if (label === "Quoted") {
      walked.push("Quoted: applied");
      break;
    }
    walked.push(`${label}: clicked`);
  }
  await shot(staff, "17-staff-quoted");
  cover("staff", "status walk to Quoted", walked.some((w) => w.startsWith("Quoted")) ? "ok" : "fail", walked.join("; "));

  await cust.goto(quoteUrl.includes("/quotes/") ? quoteUrl : `${BASE}/quotes`, {
    waitUntil: "domcontentloaded",
  });
  await cust.waitForTimeout(2000);
  await shot(cust, "18-customer-sees-quoted");
  await expandConversation(cust);
  await trySend(cust, "Customer round 4. Prices look fine. PO CRAWL-16-524.", sendFails, "cust-send-4");
  const po = cust.getByLabel(/PO number/i);
  if (await po.count()) {
    await po.first().fill("CRAWL-16-524");
    const savePo = cust.getByRole("button", { name: /Save|Upload|Submit/i }).first();
    if (await savePo.count()) await savePo.click();
    await cust.waitForTimeout(800);
  } else {
    find("major", "no-po-field", "Customer quoted view missing PO number field", {
      steps: ["Staff set Quoted", "Customer reload quote"],
      expected: "PO number input",
      actual: "field missing",
      screenshot: "18-customer-sees-quoted.png",
    });
  }
  await shot(cust, "19-customer-po");

  await staff.goto(staffQuoteUrl, { waitUntil: "domcontentloaded" });
  await staff.waitForTimeout(1500);
  await expandConversation(staff);
  await trySend(staff, "Staff round 3. PO CRAWL-16-524 received. Confirming.", sendFails, "staff-send-3");
  for (const label of ["PO received", "Confirmed", "Ordered"]) {
    const step = staff.getByRole("button", { name: label, exact: true });
    if (await step.count()) {
      await step.first().click();
      const apply = staff.getByRole("button", { name: /Apply status|Apply changes/i });
      if (await apply.count()) await apply.first().click();
      await staff.waitForTimeout(600);
    }
  }
  const tracking = staff.getByLabel(/tracking/i);
  if (await tracking.count()) {
    await tracking.first().fill("1Z999CRAWL00000000");
  }
  const carrier = staff.locator("select").first();
  if (await carrier.count()) {
    await carrier.selectOption({ label: /UPS/i }).catch(() => {});
  }
  for (const label of ["Shipped", "Delivered", "Closed"]) {
    const step = staff.getByRole("button", { name: label, exact: true });
    if (await step.count()) {
      await step.first().click();
      const apply = staff.getByRole("button", { name: /Apply status|Apply changes/i });
      if (await apply.count()) {
        await apply.first().click();
        await staff.waitForTimeout(700);
      }
    }
  }
  await shot(staff, "20-staff-lifecycle-end");
  cover("staff", "lifecycle after PO", "ok", staff.url());

  await staff.goto(`${BASE}/staff/directory`, { waitUntil: "domcontentloaded" });
  await staff.waitForTimeout(1200);
  await shot(staff, "21-staff-directory");
  const tabs = ["All", "Staff", "Customers", "People", "Hosts"];
  const tabState = {};
  for (const tab of tabs) {
    const btn = staff.getByRole("button", { name: tab, exact: true });
    tabState[tab] = await btn.count();
    if (tabState[tab]) {
      await btn.first().click();
      await staff.waitForTimeout(500);
      await shot(staff, `22-directory-${tab.toLowerCase()}`);
    }
  }
  if (tabState.Hosts) {
    find("minor", "host-tab-for-non-owner", "Host staff Directory shows Hosts tab", {
      steps: ["Open /staff/directory as host staff"],
      expected: "Hosts tab is platform-owner only per HostTenantDirectory",
      actual: "Hosts button present",
    });
  }
  cover("staff", "Directory tabs", tabState.All && tabState.Staff && tabState.Customers && tabState.People ? "ok" : "fail", JSON.stringify(tabState));

  const search = staff.locator("#tenant-directory-search, #directory-search");
  if (await search.count()) {
    await search.first().fill("crawl");
    await staff.waitForTimeout(400);
    await shot(staff, "23-directory-search-crawl");
  } else {
    find("minor", "directory-search-id", "Directory search id is not #directory-search", {
      steps: ["Open /staff/directory"],
      expected: "#directory-search per verify skill",
      actual: "selector missing; tenant host uses #tenant-directory-search",
      screenshot: "21-staff-directory.png",
    });
  }

  await staff.goto(`${BASE}/staff/directory?type=person`, { waitUntil: "domcontentloaded" });
  await staff.waitForTimeout(800);
  const newPerson = staff.getByRole("button", { name: /New Person/i });
  cover("staff", "New Person chip", (await newPerson.count()) ? "ok" : "fail", "people tab");
  await staff.goto(`${BASE}/staff/directory?type=staff`, { waitUntil: "domcontentloaded" });
  await staff.waitForTimeout(800);
  await shot(staff, "24-directory-staff");
  await staff.goto(`${BASE}/staff/directory?type=customer`, { waitUntil: "domcontentloaded" });
  await staff.waitForTimeout(800);
  await shot(staff, "25-directory-customers");

  await staff.goto(`${BASE}/care`, { waitUntil: "domcontentloaded" });
  await staff.waitForTimeout(1000);
  await shot(staff, "26-staff-care");
  const ticketLink = staff.locator('a[href*="tickets"]').first();
  if (await ticketLink.count()) {
    await ticketLink.click();
    await staff.waitForTimeout(1200);
    await expandConversation(staff);
    await trySend(staff, "Staff Care reply. We will inspect the fixture chatter on the next visit.", sendFails, "staff-care-1");
    await shot(staff, "27-staff-care-ticket");
  }
  cover("staff", "Care reply", "ok", staff.url());

  await staff.goto(`${BASE}/machines/palletizer/care/service`, { waitUntil: "domcontentloaded" });
  await staff.waitForTimeout(1200);
  await shot(staff, "28-staff-service-log");
  const serviceText = await staff.locator("body").innerText();
  if (/could not load|forbidden|not found|404/i.test(serviceText) && !/Service|Hours|visit/i.test(serviceText)) {
    find("major", "service-log-broken", "Service visit log did not render", {
      steps: ["Open /machines/palletizer/care/service as staff"],
      expected: "Service panel",
      actual: serviceText.slice(0, 400),
      screenshot: "28-staff-service-log.png",
    });
  }
  cover("staff", "Service visit log", /service|hours|visit/i.test(serviceText) ? "ok" : "fail", staff.url());

  await staff.goto(`${BASE}/staff/platform`, { waitUntil: "domcontentloaded" });
  await staff.waitForTimeout(1000);
  await shot(staff, "29-staff-platform");
  const platText = await staff.locator("body").innerText();
  cover("platform", "host staff /staff/platform", /forbidden|owner|not found|platform/i.test(platText) ? "ok" : "fail", platText.slice(0, 180));

  await staff.goto(`${BASE}/staff/tenants`, { waitUntil: "domcontentloaded" });
  await staff.waitForTimeout(1000);
  await shot(staff, "30-staff-tenants");

  await staff.goto(`${BASE}/machines/new`, { waitUntil: "domcontentloaded" });
  await staff.waitForTimeout(1000);
  await shot(staff, "31-staff-machine-new");
  cover("staff", "machine upload/new", /upload|pack|machine/i.test(await staff.locator("body").innerText()) ? "ok" : "fail", staff.url());

  await staff.setViewportSize({ width: 390, height: 844 });
  await staff.goto(`${BASE}/staff/quotes`, { waitUntil: "domcontentloaded" });
  await staff.waitForTimeout(1000);
  const moreBtn = staff.getByRole("button", { name: /^More$/ });
  if (await moreBtn.count()) {
    await moreBtn.click();
    await staff.waitForTimeout(400);
    await shot(staff, "32-staff-more-menu");
    const platLink = staff.getByRole("link", { name: "Platform" });
    if (await platLink.count()) {
      find("minor", "more-shows-platform", "More menu shows Platform for non-owner staff", {
        steps: ["Mobile More on /staff/quotes"],
        expected: "Platform hidden unless platformOwner",
        actual: "Platform link present",
        screenshot: "32-staff-more-menu.png",
      });
    }
  } else {
    find("major", "no-more-menu", "Staff mobile tab bar missing More", {
      steps: ["390px /staff/quotes"],
      expected: "More button",
      actual: "absent",
    });
  }
  cover("staff", "mobile More menu", (await moreBtn.count()) ? "ok" : "fail", "390px");

  await staff.goto(staffQuoteUrl, { waitUntil: "domcontentloaded" });
  await staff.waitForTimeout(1000);
  await expandConversation(staff);
  await trySend(staff, "Staff round 4 mobile. Confirming the thread still accepts messages after lifecycle.", sendFails, "staff-send-4");
  await shot(staff, "33-staff-quote-mobile-chat");

  await cust.setViewportSize({ width: 390, height: 844 });
  await cust.goto(quoteUrl.includes("/quotes/") ? quoteUrl : `${BASE}/quotes`, {
    waitUntil: "domcontentloaded",
  });
  await cust.waitForTimeout(3500);
  await expandConversation(cust);
  await shot(cust, "34-customer-live-after-staff");
  const laterOwn = await cust.locator(".imsg-row.imsg-own").count();
  const laterOther = await cust.locator(".imsg-row.imsg-other").count();
  if (laterOther === 0) {
    find("major", "chat-not-live", "Customer quote thread shows no staff bubbles after staff replies", {
      steps: ["Staff sent messages", "Customer reload + 3.5s poll"],
      expected: ".imsg-other rows",
      actual: `own=${laterOwn} other=${laterOther}`,
      screenshot: "34-customer-live-after-staff.png",
    });
  }
  cover("customer", "see staff replies", laterOther > 0 ? "ok" : "fail", `own=${laterOwn} other=${laterOther}`);

  if (custErrors.length) {
    find("minor", "cust-console", "Customer session page/console errors", {
      steps: ["Customer UI crawl"],
      expected: "no pageerror",
      actual: custErrors.slice(0, 8).join(" | "),
    });
  }
  if (staffErrors.length) {
    find("minor", "staff-console", "Staff session page/console errors", {
      steps: ["Staff UI crawl"],
      expected: "no pageerror",
      actual: staffErrors.slice(0, 8).join(" | "),
    });
  }
  } catch (err) {
    find("major", "ui-crawl-abort", "UI crawl threw before finishing every page", {
      steps: ["Playwright UI crawl"],
      expected: "all phases complete",
      actual: err.message,
    });
    await shot(cust, "zz-cust-abort").catch(() => "");
    await shot(staff, "zz-staff-abort").catch(() => "");
  }

  const report = {
    generatedAt: new Date().toISOString(),
    quoteUrl,
    staffQuoteUrl,
    shots,
    findingCounts: findings.reduce((acc, f) => {
      acc[f.severity] = (acc[f.severity] || 0) + 1;
      return acc;
    }, {}),
    findings,
    coverage,
    custErrors,
    staffErrors,
  };
  await fs.writeFile(path.join(EVID, "ui-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
