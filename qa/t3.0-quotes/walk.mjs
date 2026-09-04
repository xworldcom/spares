/**
 * T3.0 quote-workspace QA walk against a protected preview.
 * Bypass header is read from SPARES_PROTECTION_BYPASS only — never logged,
 * screenshotted, or written to evidence files.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.SPARES_PREVIEW_URL ?? "https://spares-6uk86cclc-yonder3.vercel.app";
const BYPASS = process.env.SPARES_PROTECTION_BYPASS ?? "";
const ARTIFACT = process.env.SPARES_QA_ARTIFACTS ?? "/opt/cursor/artifacts/t3.0-quotes";
const REPO_EVIDENCE = join(__dirname, "evidence");
const PO_PDF = join(__dirname, "po-t30-001.pdf");
const STAFF = { email: "staff@spares.local", password: "SparesStaff1!" };
const CUSTOMER = { email: "customer@spares.local", password: "SparesCustomer1!" };

if (!BYPASS) {
  console.error("SPARES_PROTECTION_BYPASS is required (env only).");
  process.exit(2);
}

for (const dir of [
  join(ARTIFACT, "screenshots"),
  join(ARTIFACT, "logs"),
  join(ARTIFACT, "video"),
  join(REPO_EVIDENCE, "screenshots"),
  join(REPO_EVIDENCE, "logs"),
]) {
  mkdirSync(dir, { recursive: true });
}

const matrix = [];
const consoleEvents = [];
const networkEvents = [];
const clock = [];

function now() {
  return new Date().toISOString();
}

function mark(step, note) {
  clock.push({ at: now(), step, note });
  console.log(`[${now()}] ${step} — ${note}`);
}

function record(id, title, result, evidence, notes = "") {
  matrix.push({ id, title, result, evidence, notes, at: now() });
}

function redactHeaders(headers) {
  const next = { ...headers };
  for (const key of Object.keys(next)) {
    if (key.toLowerCase() === "x-vercel-protection-bypass") {
      next[key] = "[REDACTED]";
    }
  }
  return next;
}

function attachLogging(page, persona) {
  page.on("console", (msg) => {
    consoleEvents.push({
      at: now(),
      persona,
      type: msg.type(),
      text: String(msg.text()).replace(/x-vercel-protection-bypass[=:]\s*\S+/gi, "[REDACTED]"),
    });
  });
  page.on("pageerror", (err) => {
    consoleEvents.push({
      at: now(),
      persona,
      type: "pageerror",
      text: String(err.message ?? err),
    });
  });
  page.on("response", (response) => {
    const url = response.url();
    if (!url.includes("/api/")) {
      return;
    }
    const path = url.replace(BASE, "");
    networkEvents.push({
      at: now(),
      persona,
      method: response.request().method(),
      path: path.split("?")[0],
      status: response.status(),
    });
  });
}

async function shot(page, name) {
  const file = `${name}.png`;
  const abs = join(ARTIFACT, "screenshots", file);
  await page.screenshot({ path: abs, fullPage: true });
  copyFileSync(abs, join(REPO_EVIDENCE, "screenshots", file));
  mark("screenshot", file);
  return file;
}

async function login(page, who) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(who.email);
  await page.locator("#password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
  await page.getByRole("button", { name: "Sign out" }).waitFor({ timeout: 15000 });
}

async function signOut(page) {
  const button = page.getByRole("button", { name: "Sign out" });
  if (await button.count()) {
    await button.click();
    await page.waitForURL(/\/login/, { timeout: 15000 }).catch(() => {});
  }
}

async function textOf(page, selector) {
  const loc = page.locator(selector).first();
  if (!(await loc.count())) {
    return "";
  }
  return ((await loc.innerText()) ?? "").trim();
}

async function bodyText(page) {
  return page.locator("body").innerText();
}

async function unreadCountFromNav(page) {
  const quotes = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Quotes" });
  if (!(await quotes.count())) {
    return 0;
  }
  const badge = quotes.locator("xpath=../span[contains(@class,'rounded-full')]");
  if (await badge.count()) {
    const raw = (await badge.first().innerText()).trim();
    if (raw === "9+") {
      return 9;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : 1;
  }
  return 0;
}

async function listHasUnread(page) {
  return (await page.getByLabel("Unread").count()) > 0;
}

async function apiJson(page, path, options = {}) {
  return page.evaluate(
    async ({ path: p, options: opts }) => {
      const res = await fetch(p, { credentials: "include", ...opts });
      let body = null;
      const text = await res.text();
      try {
        body = JSON.parse(text);
      } catch {
        body = text.slice(0, 200);
      }
      return { status: res.status, body, contentType: res.headers.get("content-type") };
    },
    { path, options },
  );
}

function writeEvidence() {
  const payload = {
    generatedAt: now(),
    preview: BASE,
    access: "automation bypass header (secret not stored)",
    matrix,
    clock,
    console: consoleEvents.slice(-200),
    network: networkEvents,
  };
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  writeFileSync(join(ARTIFACT, "logs", "walk.json"), json);
  writeFileSync(join(REPO_EVIDENCE, "logs", "walk.json"), json);
  writeFileSync(join(ARTIFACT, "logs", "matrix.json"), `${JSON.stringify(matrix, null, 2)}\n`);
  writeFileSync(join(REPO_EVIDENCE, "logs", "matrix.json"), `${JSON.stringify(matrix, null, 2)}\n`);
}

async function run() {
  mark("start", `preview ${BASE}`);
  const browser = await chromium.launch({
    channel: process.env.SPARES_QA_CHANNEL || "chrome",
    headless: true,
    args: ["--use-gl=swiftshader", "--ignore-gpu-blocklist"],
  });
  const contextOptions = {
    viewport: { width: 1440, height: 960 },
    extraHTTPHeaders: { "x-vercel-protection-bypass": BYPASS },
    recordVideo: { dir: join(ARTIFACT, "video"), size: { width: 1440, height: 960 } },
    ignoreHTTPSErrors: true,
  };

  const customerContext = await browser.newContext(contextOptions);
  const staffContext = await browser.newContext(contextOptions);
  const customer = await customerContext.newPage();
  const staff = await staffContext.newPage();
  attachLogging(customer, "customer");
  attachLogging(staff, "staff");

  let quoteNumber = null;
  let quotePathCustomer = null;
  let quotePathStaff = null;

  try {
    // 0 — login screen / protection
    mark("0", "open login");
    await customer.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    const loginShot = await shot(customer, "00-login-screen");
    const loginHtml = await customer.content();
    const loginCopy = await bodyText(customer);
    const reachedSpares =
      /Sign in/i.test(loginCopy) &&
      !/Authentication Required|Vercel Authentication|Deployment Protection/i.test(loginCopy);
    record(
      "0",
      "Bypass reaches Spares login (not Vercel SSO)",
      reachedSpares ? "PASS" : "FAIL",
      loginShot,
      reachedSpares ? "Spares sign-in rendered" : "Did not reach Spares login",
    );
    const seedsHidden =
      !/SparesStaff1!|SparesCustomer1!|staff@spares\.local|customer@spares\.local/i.test(loginCopy) &&
      !/SparesStaff1!|SparesCustomer1!/i.test(loginHtml);
    record(
      "0b",
      "Login does not show seed passwords",
      seedsHidden ? "PASS" : "FAIL",
      loginShot,
    );
    record(
      "0c",
      "No public signup",
      /no public signup/i.test(loginCopy) ? "PASS" : "FAIL",
      loginShot,
    );

    // 1 — customer request
    mark("1", "customer login");
    await login(customer, CUSTOMER);
    await customer.goto(`${BASE}/machines`, { waitUntil: "networkidle" });
    const machinesShot = await shot(customer, "01a-customer-machines");
    const machinesCopy = await bodyText(customer);
    const hasMachine = /Hardware fixture|Palletizer/i.test(machinesCopy);
    record(
      "1a",
      "Customer login → machines list (own session)",
      hasMachine ? "PASS" : "FAIL",
      machinesShot,
      hasMachine ? "Seed machines present" : "No machines",
    );

    if (await customer.getByRole("link", { name: /Hardware fixture/i }).count()) {
      await customer.getByRole("link", { name: /Hardware fixture/i }).click();
    } else {
      await customer.getByRole("link", { name: /Palletizer/i }).click();
    }
    await customer.waitForURL(/\/machines\//, { timeout: 15000 });
    await customer.locator("[data-parts-bom]").waitFor({ timeout: 25000 });
    const machineShot = await shot(customer, "01b-customer-machine");
    record(
      "1b",
      "Customer opens a machine (BOM present)",
      (await customer.locator("[data-parts-bom]").count()) > 0 ? "PASS" : "FAIL",
      machineShot,
    );

    const firstPart = customer.locator("[data-parts-bom] button").first();
    await firstPart.click();
    const addBtn = customer.getByRole("button", { name: "Add" });
    await addBtn.waitFor({ timeout: 10000 });
    await customer.locator("text=Preparing controls…").waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
    await addBtn.click();
    await customer.getByText(/1 part|parts/i).first().waitFor({ timeout: 8000 }).catch(() => {});
    // Qty bump if the tray + control is on screen
    const plus = customer.getByRole("button", { name: /Increase /i }).first();
    if (await plus.count()) {
      await plus.click();
    }
    const noteBox = customer.locator("textarea").first();
    if (await noteBox.count()) {
      await noteBox.fill("T3.0 QA — need-by Friday, line 3, serial QA-26.");
    }
    const trayShot = await shot(customer, "01c-tray-after-add");
    const trayCopy = await bodyText(customer);
    record(
      "1c",
      "Customer adds a tray line (qty present)",
      /Request quote/i.test(trayCopy) ? "PASS" : "FAIL",
      trayShot,
    );

    await customer.getByRole("button", { name: "Request quote" }).click();
    await customer.getByText(/Quote sent|View quote/i).waitFor({ timeout: 20000 });
    const requestedShot = await shot(customer, "01d-quote-requested");
    const view = customer.getByRole("link", { name: "View quote" });
    if (await view.count()) {
      await view.click();
    } else {
      await customer.goto(`${BASE}/quotes`, { waitUntil: "networkidle" });
      await customer.getByRole("link", { name: /Quote \d+/i }).first().click();
    }
    await customer.waitForURL(/\/quotes\/\d+/, { timeout: 15000 });
    quoteNumber = customer.url().match(/\/quotes\/(\d+)/)?.[1] ?? null;
    quotePathCustomer = `/quotes/${quoteNumber}`;
    quotePathStaff = `/staff/quotes/${quoteNumber}`;
    const customerRequestedShot = await shot(customer, "01e-customer-quote-requested");
    const requestedCopy = await bodyText(customer);
    const pricesHidden = /Shown after quoted/i.test(requestedCopy);
    const noCostControl = !/Supplier cost/i.test(requestedCopy);
    const noStatusButtons = (await customer.getByRole("button", { name: "Quoted" }).count()) === 0;
    const poClosed = /after this quote is issued/i.test(requestedCopy);
    record(
      "1d",
      "Customer quote created at requested",
      /Requested/i.test(requestedCopy) && Boolean(quoteNumber) ? "PASS" : "FAIL",
      requestedShot,
      `Quote ${quoteNumber ?? "?"}`,
    );
    record(
      "1e",
      "Customer does not see prices or staff pricing controls before quoted",
      pricesHidden && noCostControl && noStatusButtons ? "PASS" : "FAIL",
      customerRequestedShot,
      `pricesHidden=${pricesHidden} noCost=${noCostControl} noStatusBtns=${noStatusButtons}`,
    );
    record(
      "1f",
      "Customer PO upload closed before quoted",
      poClosed ? "PASS" : "FAIL",
      customerRequestedShot,
    );

    const preQuotedApi = await apiJson(customer, `/api/quotes/${quoteNumber}`);
    const preItems = preQuotedApi.body?.quote?.items ?? [];
    const leakedCost = preItems.some((item) => item.supplierCost != null);
    const leakedSell = preItems.some((item) => item.sellPrice != null);
    record(
      "1g",
      "Customer GET before quoted omits sell/cost",
      preQuotedApi.status === 200 && !leakedCost && !leakedSell ? "PASS" : "FAIL",
      customerRequestedShot,
      `status=${preQuotedApi.status} leakedCost=${leakedCost} leakedSell=${leakedSell}`,
    );

    // 2 — staff inbox + pricing + quoted
    mark("2", "staff login + inbox");
    await login(staff, STAFF);
    await staff.goto(`${BASE}/staff/quotes`, { waitUntil: "networkidle" });
    await staff.getByText(/Quote \d+/i).first().waitFor({ timeout: 15000 });
    const staffInboxShot = await shot(staff, "02a-staff-inbox-unread");
    const staffInboxCopy = await bodyText(staff);
    const staffSeesQuote =
      staffInboxCopy.includes(`Quote ${quoteNumber}`) &&
      /customer@spares\.local/i.test(staffInboxCopy);
    const staffUnread = (await listHasUnread(staff)) || (await unreadCountFromNav(staff)) > 0;
    record(
      "2a",
      "Staff inbox shows the new quote (all quotes)",
      staffSeesQuote ? "PASS" : "FAIL",
      staffInboxShot,
    );
    record(
      "2b",
      "Staff unread badge/dot after customer request",
      staffUnread ? "PASS" : "FAIL",
      staffInboxShot,
      `nav=${await unreadCountFromNav(staff)} listDot=${await listHasUnread(staff)}`,
    );

    await staff.getByRole("link", { name: new RegExp(`Quote ${quoteNumber}`) }).click();
    await staff.waitForURL(new RegExp(`/staff/quotes/${quoteNumber}`), { timeout: 15000 });
    await staff.getByText("Lines").waitFor({ timeout: 10000 });
    const staffOpenShot = await shot(staff, "02b-staff-quote-requested");
    const staffOpenCopy = await bodyText(staff);
    const staffPricingControls =
      /Supplier cost/i.test(staffOpenCopy) &&
      /Sell price/i.test(staffOpenCopy) &&
      /Lead time/i.test(staffOpenCopy) &&
      /Save pricing/i.test(staffOpenCopy);
    record(
      "2c",
      "Staff quote workspace: status strip + line pricing controls",
      staffPricingControls && /In review|Pricing|Quoted/i.test(staffOpenCopy) ? "PASS" : "FAIL",
      staffOpenShot,
    );

    if (await staff.getByRole("button", { name: "In review" }).count()) {
      await staff.getByRole("button", { name: "In review" }).click();
      await staff.waitForTimeout(400);
    }
    if (await staff.getByRole("button", { name: "Pricing" }).count()) {
      await staff.getByRole("button", { name: "Pricing" }).click();
      await staff.getByText(/Pricing/i).first().waitFor({ timeout: 8000 }).catch(() => {});
    }

    const sell = staff.getByLabel("Sell price");
    const cost = staff.getByLabel("Supplier cost");
    const lead = staff.getByLabel("Lead time (days)");
    const supplier = staff.getByLabel("Supplier");
    const lineNote = staff.getByLabel("Note").first();
    if (await cost.count()) {
      await cost.fill("12.50");
    }
    if (await sell.count()) {
      await sell.fill("48.00");
    }
    if (await lead.count()) {
      await lead.fill("5");
    }
    if (await supplier.count()) {
      await supplier.fill("McMaster");
    }
    if (await lineNote.count()) {
      await lineNote.fill("QA T3.0 line note");
    }
    await staff.getByRole("button", { name: "Save pricing" }).click();
    await staff.getByText("Pricing saved.").waitFor({ timeout: 15000 }).catch(() => {});
    const pricedShot = await shot(staff, "02c-staff-pricing-saved");
    record(
      "2d",
      "Staff sets sell (+ cost/lead/supplier/note) and saves",
      /Pricing saved|48/i.test(await bodyText(staff)) ? "PASS" : "FAIL",
      pricedShot,
    );

    await staff.getByRole("button", { name: "Quoted" }).click();
    await staff.waitForTimeout(600);
    const quotedShot = await shot(staff, "02d-staff-quoted");
    const quotedCopy = await bodyText(staff);
    record(
      "2e",
      "Staff advances status to quoted",
      /Quoted/i.test(quotedCopy) ? "PASS" : "FAIL",
      quotedShot,
    );

    // 3 — customer prices, unread, comment, PO
    mark("3", "customer after quoted");
    await customer.goto(`${BASE}/quotes`, { waitUntil: "networkidle" });
    await customer.getByText(`Quote ${quoteNumber}`).waitFor({ timeout: 15000 });
    const customerListShot = await shot(customer, "03a-customer-list-unread");
    const customerUnread =
      (await listHasUnread(customer)) || (await unreadCountFromNav(customer)) > 0;
    record(
      "3a",
      "Customer unread after staff activity (quoted/pricing)",
      customerUnread ? "PASS" : "FAIL",
      customerListShot,
      `nav=${await unreadCountFromNav(customer)} listDot=${await listHasUnread(customer)}`,
    );

    await customer.getByRole("link", { name: new RegExp(`Quote ${quoteNumber}`) }).click();
    await customer.waitForURL(new RegExp(`/quotes/${quoteNumber}`), { timeout: 15000 });
    const customerPricedShot = await shot(customer, "03b-customer-prices");
    const customerPriced = await bodyText(customer);
    const seesSell = /\$48|48\.00|48/.test(customerPriced) && /Sell/i.test(customerPriced);
    const seesLead = /5d|Lead time/i.test(customerPriced);
    const stillNoCost = !/Supplier cost/i.test(customerPriced) && !/McMaster/i.test(customerPriced);
    record(
      "3b",
      "Customer sees sell + lead after quoted; no supplier cost",
      seesSell && seesLead && stillNoCost ? "PASS" : "FAIL",
      customerPricedShot,
      `sell=${seesSell} lead=${seesLead} noCost=${stillNoCost}`,
    );

    const postQuotedApi = await apiJson(customer, `/api/quotes/${quoteNumber}`);
    const postItems = postQuotedApi.body?.quote?.items ?? [];
    const apiSell = postItems.some((item) => item.sellPrice === 48 || item.sellPrice === 48.0);
    const apiCost = postItems.some((item) => item.supplierCost != null);
    record(
      "3c",
      "Customer GET after quoted includes sell, omits supplier cost",
      postQuotedApi.status === 200 && apiSell && !apiCost ? "PASS" : "FAIL",
      customerPricedShot,
      `sell=${apiSell} costLeaked=${apiCost}`,
    );

    await customer.locator("textarea").fill("Customer: confirm Friday delivery to line 3.");
    await customer.getByRole("button", { name: "Send" }).click();
    await customer.getByText("Customer: confirm Friday delivery to line 3.").waitFor({ timeout: 15000 });
    const commentShot = await shot(customer, "03c-customer-comment");
    record(
      "3d",
      "Customer posts activity comment",
      /confirm Friday delivery/i.test(await bodyText(customer)) ? "PASS" : "FAIL",
      commentShot,
    );

    const poAllowed = !/after this quote is issued/i.test(await bodyText(customer));
    await customer.getByPlaceholder("Your PO").fill("PO-T30-001");
    await customer.locator('input[type="file"]').setInputFiles(PO_PDF);
    await customer.getByRole("button", { name: /Upload PO|Save PO/i }).click();
    await customer.getByText(/PO uploaded|PO-T30-001|PO received/i).waitFor({ timeout: 20000 });
    const poShot = await shot(customer, "03d-customer-po-uploaded");
    const poCopy = await bodyText(customer);
    record(
      "3e",
      "Customer enters PO number + uploads PDF when quoted",
      /PO-T30-001/i.test(poCopy) && poAllowed ? "PASS" : "FAIL",
      poShot,
    );
    record(
      "3f",
      "Upload while quoted moves status to PO received",
      /PO received/i.test(poCopy) ? "PASS" : "FAIL",
      poShot,
    );

    // 4 — staff PO + ship
    mark("4", "staff PO + tracking");
    await staff.goto(`${BASE}/staff/quotes`, { waitUntil: "networkidle" });
    await staff.getByText(`Quote ${quoteNumber}`).waitFor({ timeout: 15000 });
    const staffAfterPoList = await shot(staff, "04a-staff-list-after-po");
    const staffUnreadAfterCustomer =
      (await listHasUnread(staff)) || (await unreadCountFromNav(staff)) > 0;
    record(
      "4a",
      "Staff unread after customer comment/PO",
      staffUnreadAfterCustomer ? "PASS" : "FAIL",
      staffAfterPoList,
      `nav=${await unreadCountFromNav(staff)} listDot=${await listHasUnread(staff)}`,
    );

    await staff.getByRole("link", { name: new RegExp(`Quote ${quoteNumber}`) }).click();
    await staff.waitForURL(new RegExp(`/staff/quotes/${quoteNumber}`), { timeout: 15000 });
    const staffPoShot = await shot(staff, "04b-staff-po-visible");
    const staffPoCopy = await bodyText(staff);
    const seesPo = /PO-T30-001/i.test(staffPoCopy);
    const hasDownload = (await staff.getByRole("link", { name: "Download PDF" }).count()) > 0;
    record("4b", "Staff sees PO number", seesPo ? "PASS" : "FAIL", staffPoShot);
    record("4c", "Staff is offered Download PDF", hasDownload ? "PASS" : "FAIL", staffPoShot);

    let pdfOk = false;
    if (hasDownload) {
      const pdf = await staff.evaluate(async (n) => {
        const res = await fetch(`/api/quotes/${n}/po`, { credentials: "include" });
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf.slice(0, 5));
        const magic = String.fromCharCode(...bytes);
        return {
          status: res.status,
          type: res.headers.get("content-type"),
          magic,
          size: buf.byteLength,
        };
      }, quoteNumber);
      pdfOk = pdf.status === 200 && /pdf/i.test(pdf.type ?? "") && pdf.magic.startsWith("%PDF");
      record(
        "4d",
        "Staff can download the PO PDF",
        pdfOk ? "PASS" : "FAIL",
        staffPoShot,
        `status=${pdf.status} type=${pdf.type} magic=${pdf.magic} size=${pdf.size}`,
      );
    } else {
      record("4d", "Staff can download the PO PDF", "FAIL", staffPoShot, "No download link");
    }

    for (const label of ["Confirmed", "Ordered"]) {
      const btn = staff.getByRole("button", { name: label, exact: true });
      if (await btn.count()) {
        await btn.click();
        await staff.waitForTimeout(500);
      }
    }
    const orderedShot = await shot(staff, "04c-staff-ordered");
    record(
      "4e",
      "Staff advances toward shipped (confirmed → ordered)",
      /Ordered/i.test(await bodyText(staff)) ? "PASS" : "FAIL",
      orderedShot,
    );

    const trackingInput = staff.getByPlaceholder("Tracking number");
    if (await trackingInput.count()) {
      const carrier = staff.locator("select").first();
      if (await carrier.count()) {
        await carrier.selectOption("UPS");
      }
      await trackingInput.fill("1Z999AA10123456784");
    } else {
      mark("4", "tracking fields not editable — trying Add tracking / status Shipped");
    }
    const saveTracking = staff.getByRole("button", { name: "Save tracking" });
    if (await saveTracking.count()) {
      await saveTracking.click();
      await staff.getByText(/Tracking saved|Marked shipped|Shipped/i).waitFor({ timeout: 15000 }).catch(() => {});
    }
    const shipBtn = staff.getByRole("button", { name: "Shipped", exact: true });
    if (await shipBtn.count()) {
      await shipBtn.click();
      await staff.waitForTimeout(600);
    }
    const shippedShot = await shot(staff, "04d-staff-shipped");
    const shippedCopy = await bodyText(staff);
    record(
      "4f",
      "Staff sets tracking and marks shipped",
      /Shipped/i.test(shippedCopy) && /1Z999AA10123456784/.test(shippedCopy) ? "PASS" : "FAIL",
      shippedShot,
    );

    // 5 — customer shipped + tracking
    mark("5", "customer shipped");
    await customer.goto(`${BASE}/quotes`, { waitUntil: "networkidle" });
    await customer.getByRole("link", { name: new RegExp(`Quote ${quoteNumber}`) }).click();
    await customer.waitForURL(new RegExp(`/quotes/${quoteNumber}`), { timeout: 15000 });
    const customerShipShot = await shot(customer, "05a-customer-shipped");
    const customerShip = await bodyText(customer);
    record(
      "5a",
      "Customer sees shipped + tracking number",
      /Shipped/i.test(customerShip) && /1Z999AA10123456784/.test(customerShip) ? "PASS" : "FAIL",
      customerShipShot,
    );

    // 6 — unread after cross-party activity
    mark("6", "cross-party unread");
    await staff.goto(`${BASE}${quotePathStaff}`, { waitUntil: "networkidle" });
    await staff.locator("textarea").fill("Staff: boxed and handed to UPS this morning.");
    await staff.getByRole("button", { name: "Send" }).click();
    await staff.getByText("Staff: boxed and handed to UPS this morning.").waitFor({ timeout: 15000 });
    await customer.goto(`${BASE}/quotes`, { waitUntil: "networkidle" });
    const unreadCustShot = await shot(customer, "06a-customer-unread-after-staff-note");
    const custUnread2 = (await listHasUnread(customer)) || (await unreadCountFromNav(customer)) > 0;
    record(
      "6a",
      "Customer unread after staff activity note",
      custUnread2 ? "PASS" : "FAIL",
      unreadCustShot,
    );

    await customer.getByRole("link", { name: new RegExp(`Quote ${quoteNumber}`) }).click();
    await customer.locator("textarea").fill("Customer: thanks — dock is clear.");
    await customer.getByRole("button", { name: "Send" }).click();
    await customer.getByText("Customer: thanks — dock is clear.").waitFor({ timeout: 15000 });
    await staff.goto(`${BASE}/staff/quotes`, { waitUntil: "networkidle" });
    const unreadStaffShot = await shot(staff, "06b-staff-unread-after-customer-note");
    const staffUnread2 = (await listHasUnread(staff)) || (await unreadCountFromNav(staff)) > 0;
    record(
      "6b",
      "Staff unread after customer activity note",
      staffUnread2 ? "PASS" : "FAIL",
      unreadStaffShot,
    );

    // 7 — role walls
    mark("7", "role walls");
    await customer.goto(`${BASE}/staff/quotes`, { waitUntil: "networkidle" });
    const wallA = await shot(customer, "07a-customer-staff-quotes-wall");
    record(
      "7a",
      "Customer cannot open staff quotes inbox",
      /Wrong role|staff only/i.test(await bodyText(customer)) ? "PASS" : "FAIL",
      wallA,
    );
    await customer.goto(`${BASE}${quotePathStaff}`, { waitUntil: "networkidle" });
    const wallB = await shot(customer, "07b-customer-staff-quote-detail-wall");
    record(
      "7b",
      "Customer cannot open staff quote workspace URL",
      /Wrong role|staff only/i.test(await bodyText(customer)) ? "PASS" : "FAIL",
      wallB,
    );
    const staffListApi = await apiJson(customer, "/api/quotes");
    const onlyOwn =
      staffListApi.status === 200 &&
      (staffListApi.body?.quotes ?? []).every((q) => q.customerEmail === CUSTOMER.email || !q.customerEmail);
    record(
      "7c",
      "Customer list API returns only own quotes",
      onlyOwn ? "PASS" : "FAIL",
      wallA,
      `status=${staffListApi.status} n=${(staffListApi.body?.quotes ?? []).length}`,
    );

    await staff.goto(`${BASE}/quotes`, { waitUntil: "networkidle" });
    const wallC = await shot(staff, "07c-staff-customer-quotes-wall");
    record(
      "7d",
      "Staff cannot use customer /quotes route",
      /Wrong role|customers only/i.test(await bodyText(staff)) ? "PASS" : "FAIL",
      wallC,
    );

    await signOut(customer);
    await customer.goto(`${BASE}/staff/quotes`, { waitUntil: "networkidle" });
    const wallD = await shot(customer, "07d-logged-out-staff-quotes");
    record(
      "7e",
      "Logged-out staff URL does not leak staff UI",
      /Not signed in/i.test(await bodyText(customer)) ? "PASS" : "FAIL",
      wallD,
    );

    // Activity feed visible at end
    await login(customer, CUSTOMER);
    await customer.goto(`${BASE}${quotePathCustomer}`, { waitUntil: "networkidle" });
    const feedShot = await shot(customer, "08-customer-activity-feed");
    const feed = await bodyText(customer);
    record(
      "8",
      "Customer activity feed shows shared thread",
      /confirm Friday delivery|thanks — dock is clear|boxed and handed to UPS|Status set to/i.test(feed)
        ? "PASS"
        : "FAIL",
      feedShot,
    );
  } catch (err) {
    mark("error", String(err?.stack ?? err));
    try {
      await shot(customer, "99-customer-error");
    } catch {
      /* ignore */
    }
    try {
      await shot(staff, "99-staff-error");
    } catch {
      /* ignore */
    }
    record("99", "Walk completed without harness crash", "FAIL", "99-customer-error.png", String(err?.message ?? err));
    throw err;
  } finally {
    writeEvidence();
    await customerContext.close();
    await staffContext.close();
    await browser.close();
    writeEvidence();
    const fails = matrix.filter((row) => row.result === "FAIL").length;
    const passes = matrix.filter((row) => row.result === "PASS").length;
    mark("done", `${passes} PASS / ${fails} FAIL / ${matrix.length} rows`);
    console.log(JSON.stringify({ passes, fails, rows: matrix.length, quoteNumber }, null, 2));
    if (fails > 0) {
      process.exitCode = 1;
    }
  }
}

run().catch((err) => {
  console.error(String(err?.stack ?? err).replace(BYPASS, "[REDACTED]"));
  process.exit(1);
});
