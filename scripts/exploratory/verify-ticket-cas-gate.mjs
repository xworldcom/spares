/**
 * Kevin CAS gate — prod or local.
 * OEE360_BASE_URL=https://oee360.com node scripts/exploratory/verify-ticket-cas-gate.mjs
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.OEE360_BASE_URL ?? "http://127.0.0.1:3010";
const IS_LOCAL = /localhost|127\.0\.0\.1/.test(BASE);
const OUT =
  process.env.CAS_GATE_OUT ??
  path.join(process.cwd(), ".cursor/skills/verify-oee360/.run-state", "cas-gate-proof");
const STAFF_A = {
  email:
    process.env.OEE360_STAFF_A_EMAIL ??
    (IS_LOCAL ? "staff@spares.local" : "staff@demo.com"),
  password:
    process.env.OEE360_STAFF_A_PASSWORD ??
    (IS_LOCAL ? "SparesStaff1!" : "demo123456"),
  displayName: process.env.OEE360_STAFF_A_NAME ?? (IS_LOCAL ? "Staff A" : "Demo staff"),
};
const STAFF_B = {
  email:
    process.env.OEE360_STAFF_B_EMAIL ??
    (IS_LOCAL ? "staff-b@spares.local" : "staff-b@demo.com"),
  password:
    process.env.OEE360_STAFF_B_PASSWORD ??
    (IS_LOCAL ? "SparesStaff1!" : "demo123456"),
  displayName: "Staff B",
};

const STATUS_LABELS = {
  open: "Open",
  in_progress: "In progress",
  waiting_on_customer: "Waiting on customer",
  closed: "Closed",
};

async function readJson(res) {
  const text = await res.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`invalid JSON ${res.status()} ${text.slice(0, 120)}`);
  }
}

async function loginContext(browser, staff) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  context.setDefaultTimeout(90_000);
  const login = await context.request.post(`${BASE}/api/auth/login`, { data: staff });
  if (!login.ok()) {
    throw new Error(`login ${staff.email} failed ${login.status()} ${await login.text()}`);
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
  const created = await api.post(`${BASE}/api/machines/${machineId}/tickets`, {
    data: { title: `${label} ${Date.now()}` },
  });
  if (!created.ok()) {
    throw new Error(`create ticket failed ${created.status()} ${await created.text()}`);
  }
  const body = await readJson(created);
  if (!body?.ticket) {
    throw new Error("create ticket missing body");
  }
  return body.ticket;
}

async function waitDetailReady(page) {
  await page.waitForSelector("[data-care-ticket-detail]", { timeout: 60_000 });
  await page.waitForSelector(".quote-progress-track button:not([disabled])", {
    timeout: 60_000,
  });
}

async function clickStatus(page, status) {
  await page
    .locator(".quote-progress-track")
    .getByRole("button", { name: STATUS_LABELS[status], exact: true })
    .click();
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = {
    baseUrl: BASE,
    sha: process.env.OEE360_GIT_SHA ?? "pending",
    serverSemantics:
      process.env.CAS_SERVER_SEMANTICS ??
      "PATCH carries field snapshot; 409 only same-field + different writer; client adopts PATCH response version",
    scenarios: {},
    pass: false,
  };

  const ctxA = await loginContext(browser, STAFF_A);
  const apiA = ctxA.request;
  const machines = (await readJson(await apiA.get(`${BASE}/api/machines`)))?.machines ?? [];
  const machineId = machines[0]?.id;

  const ticket1 = await createOpenTicket(apiA, machineId, "CAS s1");
  const pageA1 = await ctxA.newPage();
  await pageA1.goto(`${BASE}/care/tickets/${ticket1.id}`);
  await waitDetailReady(pageA1);
  await clickStatus(pageA1, "in_progress");
  await pageA1.waitForTimeout(2500);
  const after1 = (await readJson(await apiA.get(`${BASE}/api/tickets/${ticket1.id}`)))?.ticket;
  const s1Conflict = await pageA1.locator("[data-record-conflict-banner]").isVisible().catch(() => false);
  report.scenarios.singleSession = {
    ticketId: ticket1.id,
    conflictBanner: s1Conflict,
    statusSaved: after1?.status === "in_progress",
    pass: !s1Conflict && after1?.status === "in_progress",
  };
  await pageA1.screenshot({ path: path.join(OUT, "s1-single-session.png"), fullPage: true });

  const ticket2 = await createOpenTicket(apiA, machineId, "CAS s2");
  let ctxB;
  try {
    ctxB = await loginContext(browser, STAFF_B);
  } catch (cause) {
    report.scenarios.twoSessionStale = {
      pass: false,
      error: `staff-b login required for writer proof: ${cause instanceof Error ? cause.message : cause}`,
    };
    report.pass = false;
    await writeFile(path.join(OUT, "cas-gate-report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
    process.exit(1);
  }
  const apiB = ctxB.request;
  const pageB = await ctxB.newPage();
  await pageB.goto(`${BASE}/care/tickets/${ticket2.id}`);
  await waitDetailReady(pageB);
  const staleVersion = (await readJson(await apiB.get(`${BASE}/api/tickets/${ticket2.id}`)))?.ticket
    ?.recordVersion;
  let blockDetailPoll = true;
  await pageB.route(`**/api/tickets/${ticket2.id}`, (route) => {
    if (blockDetailPoll && route.request().method() === "GET") {
      void route.abort();
      return;
    }
    route.continue();
  });
  await apiA.patch(`${BASE}/api/tickets/${ticket2.id}`, {
    data: {
      status: "in_progress",
      recordVersion: staleVersion,
      baseStatus: "open",
    },
  });
  const afterA = (await readJson(await apiA.get(`${BASE}/api/tickets/${ticket2.id}`)))?.ticket;
  await clickStatus(pageB, "waiting_on_customer");
  await pageB.waitForTimeout(2500);
  const bannerText = await pageB
    .locator("[data-record-conflict-banner]")
    .innerText()
    .catch(() => "");
  const s2Conflict = bannerText.length > 0;
  const mid = (await readJson(await apiB.get(`${BASE}/api/tickets/${ticket2.id}`)))?.ticket;
  const bSilentlyWon = mid?.status === "waiting_on_customer" && afterA?.status === "in_progress";
  const notSomeone = s2Conflict && !/Someone else/i.test(bannerText);
  const namesWriterA =
    s2Conflict &&
    notSomeone &&
    !/Staff B/i.test(bannerText) &&
    (/Demo staff/i.test(bannerText) ||
      /Staff A/i.test(bannerText) ||
      /Spares staff/i.test(bannerText) ||
      /staff@/i.test(bannerText));

  if (s2Conflict) {
    blockDetailPoll = false;
    const refreshBtn = pageB.getByRole("button", { name: /refresh/i });
    if (await refreshBtn.isVisible().catch(() => false)) {
      await refreshBtn.click();
      await pageB
        .waitForResponse(
          (res) =>
            res.url().includes(`/api/tickets/${ticket2.id}`) &&
            res.request().method() === "GET" &&
            res.ok(),
          { timeout: 30_000 },
        )
        .catch(() => undefined);
    }
    await waitDetailReady(pageB);
    await pageB
      .locator(".quote-progress-track")
      .getByRole("button", { name: STATUS_LABELS.in_progress, exact: true })
      .waitFor({ state: "visible", timeout: 15_000 })
      .catch(() => undefined);
    await clickStatus(pageB, "waiting_on_customer");
    await pageB.waitForTimeout(2500);
  }
  const finalB = (await readJson(await apiB.get(`${BASE}/api/tickets/${ticket2.id}`)))?.ticket;

  report.scenarios.twoSessionStale = {
    ticketId: ticket2.id,
    aStatusAfterWrite: afterA?.status,
    conflictBanner: s2Conflict,
    bannerText: bannerText.slice(0, 500),
    bSilentlyWonBeforeRefresh: bSilentlyWon,
    notSomeoneElse: notSomeone,
    afterRefreshStatus: finalB?.status,
    afterRefreshSaved: finalB?.status === "waiting_on_customer",
    namesWriterA,
    pass:
      s2Conflict &&
      !bSilentlyWon &&
      notSomeone &&
      namesWriterA &&
      finalB?.status === "waiting_on_customer",
  };
  await pageB.screenshot({ path: path.join(OUT, "s2-after-refresh.png"), fullPage: true });

  const ticket3 = await createOpenTicket(apiA, machineId, "CAS s3");
  const pageA3 = await ctxA.newPage();
  await pageA3.goto(`${BASE}/care/tickets/${ticket3.id}`);
  await waitDetailReady(pageA3);
  await clickStatus(pageA3, "closed");
  await pageA3.waitForTimeout(2000);
  await clickStatus(pageA3, "open");
  await pageA3.waitForTimeout(2500);
  const s3Conflict = await pageA3.locator("[data-record-conflict-banner]").isVisible().catch(() => false);
  const after3 = (await readJson(await apiA.get(`${BASE}/api/tickets/${ticket3.id}`)))?.ticket;
  report.scenarios.ownSequentialWrites = {
    ticketId: ticket3.id,
    conflictBanner: s3Conflict,
    finalStatus: after3?.status,
    pass: !s3Conflict && after3?.status === "open",
  };

  report.pass =
    report.scenarios.singleSession.pass &&
    report.scenarios.twoSessionStale.pass &&
    report.scenarios.ownSequentialWrites.pass;

  await writeFile(path.join(OUT, "cas-gate-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(report.pass ? 0 : 1);
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
