/**
 * Kevin multi-user CAS gate — run against localhost or prod.
 * OEE360_BASE_URL=https://oee360.com node scripts/exploratory/verify-ticket-cas-gate.mjs
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.OEE360_BASE_URL ?? "http://127.0.0.1:3010";
const OUT = process.env.CAS_GATE_OUT ?? path.join(
  process.cwd(),
  ".cursor/skills/verify-oee360/.run-state",
  "cas-gate-proof",
);
const STAFF_A = {
  email: process.env.OEE360_STAFF_A_EMAIL ?? "staff@demo.com",
  password: process.env.OEE360_STAFF_A_PASSWORD ?? "demo123456",
  displayName: process.env.OEE360_STAFF_A_NAME ?? "Staff A",
};
const STAFF_B = {
  email: process.env.OEE360_STAFF_B_EMAIL ?? "staff-b@demo.com",
  password: process.env.OEE360_STAFF_B_PASSWORD ?? "demo123456",
  displayName: "Staff B",
};

const STATUS_LABELS = {
  open: "Open",
  in_progress: "In progress",
  waiting_on_customer: "Waiting on customer",
  closed: "Closed",
};

async function loginContext(browser, staff) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  context.setDefaultTimeout(90_000);
  const login = await context.request.post(`${BASE}/api/auth/login`, { data: staff });
  if (!login.ok()) {
    const body = await login.text();
    throw new Error(`login ${staff.email} failed ${login.status()} ${body}`);
  }
  const raw = login.headers()["set-cookie"];
  const header = Array.isArray(raw) ? raw[0] : raw;
  const [pair] = header.split(";");
  const eq = pair.indexOf("=");
  const host = new URL(BASE).hostname;
  await context.addCookies([
    {
      name: pair.slice(0, eq),
      value: pair.slice(eq + 1),
      domain: host === "localhost" ? "127.0.0.1" : host,
      path: "/",
    },
  ]);
  return context;
}

async function createOpenTicket(api, machineId, label) {
  if (!machineId) {
    throw new Error("machineId required to create ticket");
  }
  const created = await api.post(`${BASE}/api/machines/${machineId}/tickets`, {
    data: { title: `${label} ${Date.now()}` },
  });
  if (!created.ok()) {
    const errText = await created.text().catch(() => "");
    throw new Error(`create ticket failed ${created.status()} ${errText}`);
  }
  const raw = await created.text();
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error(`create ticket invalid JSON: ${raw.slice(0, 200)}`);
  }
  const ticket = body?.ticket;
  if (!ticket) {
    throw new Error("create ticket missing body");
  }
  return ticket;
}

async function waitDetailReady(page) {
  await page.waitForSelector("[data-care-ticket-detail]", { timeout: 60_000 });
  await page.waitForSelector(".quote-progress-track button:not([disabled])", {
    timeout: 60_000,
  });
}

async function clickStatus(page, status) {
  await page.getByRole("button", { name: STATUS_LABELS[status] }).click();
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = {
    baseUrl: BASE,
    sha: process.env.OEE360_GIT_SHA ?? "073e175",
    serverSemantics:
      process.env.CAS_SERVER_SEMANTICS ??
      "mutateTicket: on version mismatch, infer touched-field overlap when server field diff empty but live version advanced (field-level CAS, not version-only); client uses getTicketFresh before writes",
    scenarios: {},
    pass: false,
  };

  const ctxA = await loginContext(browser, STAFF_A);
  const apiA = ctxA.request;
  const machines = (await (await apiA.get(`${BASE}/api/machines`)).json()).machines ?? [];
  const machineId = machines[0]?.id;

  // --- Scenario 1: single session ---
  const ticket1 = await createOpenTicket(apiA, machineId, "CAS s1");
  const pageA1 = await ctxA.newPage();
  await pageA1.goto(`${BASE}/care/tickets/${ticket1.id}`);
  await waitDetailReady(pageA1);
  await clickStatus(pageA1, "in_progress");
  await pageA1.waitForTimeout(2500);
  const after1 = (await (await apiA.get(`${BASE}/api/tickets/${ticket1.id}`)).json()).ticket;
  const s1Conflict = await pageA1.locator("[data-record-conflict-banner]").isVisible().catch(() => false);
  report.scenarios.singleSession = {
    ticketId: ticket1.id,
    conflictBanner: s1Conflict,
    statusSaved: after1.status === "in_progress",
    pass: !s1Conflict && after1.status === "in_progress",
  };
  await pageA1.screenshot({ path: path.join(OUT, "s1-single-session.png"), fullPage: true });

  // --- Scenario 2: two contexts, B stale ---
  const ticket2 = await createOpenTicket(apiA, machineId, "CAS s2");
  let ctxB;
  try {
    ctxB = await loginContext(browser, STAFF_B);
  } catch {
    ctxB = await loginContext(browser, STAFF_A);
    report.scenarios.twoSessionStaleNote =
      "Staff B login unavailable; used second browser context with Staff A credentials (still tests stale client version).";
  }
  const apiB = ctxB.request;
  const pageB = await ctxB.newPage();
  await pageB.goto(`${BASE}/care/tickets/${ticket2.id}`);
  await waitDetailReady(pageB);

  const staleVersion = (await (await apiB.get(`${BASE}/api/tickets/${ticket2.id}`)).json()).ticket
    .recordVersion;

  await apiA.patch(`${BASE}/api/tickets/${ticket2.id}`, {
    data: { status: "in_progress", recordVersion: staleVersion },
  });
  const afterA = (await (await apiA.get(`${BASE}/api/tickets/${ticket2.id}`)).json()).ticket;

  await clickStatus(pageB, "waiting_on_customer");
  await pageB.waitForTimeout(2500);
  const bannerText = await pageB
    .locator("[data-record-conflict-banner]")
    .innerText()
    .catch(() => "");
  const s2Conflict = bannerText.length > 0;
  const namesA =
    STAFF_A.displayName.split(" ")[0] ?? "Staff";
  const writerNamed =
    s2Conflict &&
    (bannerText.includes(STAFF_A.displayName) ||
      bannerText.includes(namesA) ||
      bannerText.includes("staff-a@demo.com") ||
      bannerText.includes("Staff A") ||
      bannerText.includes("Demo staff") ||
      bannerText.includes("staff@demo.com"));
  const notSomeoneOnly =
    s2Conflict && !/updated by Someone else/i.test(bannerText);

  const mid = (await (await apiB.get(`${BASE}/api/tickets/${ticket2.id}`)).json()).ticket;
  const bSilentlyWon = mid.status === "waiting_on_customer" && afterA.status === "in_progress";

  await pageB.screenshot({ path: path.join(OUT, "s2-stale-conflict.png"), fullPage: true });

  if (s2Conflict) {
    const refreshBtn = pageB.getByRole("button", { name: /refresh/i });
    if (await refreshBtn.isVisible().catch(() => false)) {
      await refreshBtn.click();
      await pageB.waitForTimeout(3000);
    }
    await waitDetailReady(pageB);
    await clickStatus(pageB, "waiting_on_customer");
    await pageB.waitForTimeout(2500);
  }
  const finalB = (await (await apiB.get(`${BASE}/api/tickets/${ticket2.id}`)).json()).ticket;
  const s2AfterRefresh = finalB.status === "waiting_on_customer";

  report.scenarios.twoSessionStale = {
    ticketId: ticket2.id,
    aStatusAfterWrite: afterA.status,
    conflictBanner: s2Conflict,
    bannerText: bannerText.slice(0, 500),
    writerNamedA: writerNamed,
    notSomeoneElseOnly: notSomeoneOnly,
    bSilentlyWonBeforeRefresh: bSilentlyWon,
    afterRefreshStatus: finalB.status,
    afterRefreshSaved: s2AfterRefresh,
    pass: s2Conflict && !bSilentlyWon && notSomeoneOnly && writerNamed && s2AfterRefresh,
  };
  await pageB.screenshot({ path: path.join(OUT, "s2-after-refresh.png"), fullPage: true });

  report.pass =
    report.scenarios.singleSession.pass && report.scenarios.twoSessionStale.pass;

  await writeFile(path.join(OUT, "cas-gate-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(report.pass ? 0 : 1);
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
