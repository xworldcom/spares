/**
 * C-H1 browser proof on local disposable store.
 * node scripts/exploratory/verify-ticket-conflict-hotfix.mjs
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.OEE360_BASE_URL ?? "http://127.0.0.1:3010";
const OUT = path.join(
  process.cwd(),
  ".cursor/skills/verify-oee360/.run-state",
  "c-h1-hotfix-proof",
);
const STAFF = { email: "staff@spares.local", password: "SparesStaff1!" };

function pickStatus(current) {
  const order = ["open", "in_progress", "waiting_on_customer", "closed"];
  const idx = order.indexOf(current);
  return order[(idx + 1) % order.length] ?? "in_progress";
}

function statusLabel(status) {
  return status.replace(/_/g, " ");
}

async function signIn(context) {
  const login = await context.request.post(`${BASE}/api/auth/login`, { data: STAFF });
  if (!login.ok()) {
    throw new Error(`staff login failed ${login.status()}`);
  }
  const raw = login.headers()["set-cookie"];
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (!header) {
    throw new Error("login missing session cookie");
  }
  const [pair] = header.split(";");
  const eq = pair.indexOf("=");
  await context.addCookies([
    {
      name: pair.slice(0, eq),
      value: pair.slice(eq + 1),
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await signIn(context);
  const page = await context.newPage();
  const api = context.request;

  let listRes = await api.get(`${BASE}/api/tickets`);
  let tickets = (await listRes.json()).tickets ?? [];
  if (tickets.length < 2) {
    const machines = (await (await api.get(`${BASE}/api/machines`)).json()).machines ?? [];
    const machineId = machines[0]?.id;
    if (!machineId) {
      throw new Error("no machines to seed tickets");
    }
    for (let i = 0; i < 2; i += 1) {
      await api.post(`${BASE}/api/machines/${machineId}/tickets`, {
        data: { title: `C-H1 verify ${i + 1}` },
      });
    }
    listRes = await api.get(`${BASE}/api/tickets`);
    tickets = (await listRes.json()).tickets ?? [];
  }
  if (tickets.length < 2) {
    throw new Error("need at least 2 tickets for list scope check");
  }
  const STATUS_LABELS = {
    open: "Open",
    in_progress: "In progress",
    waiting_on_customer: "Waiting on customer",
    closed: "Closed",
  };
  let target =
    tickets.find((t) => t.status === "open") ??
    tickets.find((t) => t.status === "in_progress") ??
    tickets[0];
  if (target.status !== "open") {
    const machines = (await (await api.get(`${BASE}/api/machines`)).json()).machines ?? [];
    const machineId = machines[0]?.id;
    const created = await api.post(`${BASE}/api/machines/${machineId}/tickets`, {
      data: { title: `C-H1 open ${Date.now()}` },
    });
    const body = await created.json();
    target = body.ticket ?? target;
  }

  await page.goto(`${BASE}/care/tickets`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".care-row", { timeout: 45_000 });
  const listCountAll = await page.locator(".care-row").count();

  await page.goto(`${BASE}/care/tickets/${target.id}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-care-ticket-detail]", { timeout: 45_000 });
  await page.waitForSelector(".quote-progress-track button:not([disabled])", {
    timeout: 45_000,
  });
  await page.screenshot({ path: path.join(OUT, "hub-all-machines-list.png") });

  await api.post(`${BASE}/api/tickets/${target.id}/activity`, {
    data: { text: `C-H1 hotfix probe ${Date.now()}` },
  });
  const fresh = await api.get(`${BASE}/api/tickets/${target.id}`);
  const serverTicket = (await fresh.json()).ticket;

  const nextStatus = "in_progress";
  const statusBtn = page.getByRole("button", {
    name: STATUS_LABELS[nextStatus],
  });
  await statusBtn.click();
  await page.waitForTimeout(2000);

  const conflictVisible = await page.locator("[data-record-conflict-banner]").isVisible().catch(() => false);
  const someoneVisible = await page.getByText(/Someone else/i).isVisible().catch(() => false);

  const after = await api.get(`${BASE}/api/tickets/${target.id}`);
  const afterTicket = (await after.json()).ticket;
  const statusSaved = afterTicket.status === nextStatus;

  const report = {
    ticketNumber: target.number,
    listRowsOnAllMachines: listCountAll,
    listScopePass: listCountAll >= 2,
    conflictBanner: conflictVisible,
    someoneElseBanner: someoneVisible,
    statusSavedAfterStaleVersionBump: statusSaved,
    pass:
      !conflictVisible &&
      !someoneVisible &&
      statusSaved &&
      listCountAll >= 2,
  };
  await page.screenshot({ path: path.join(OUT, "after-status-click.png"), fullPage: true });
  await writeFile(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  if (!report.pass) {
    process.exit(1);
  }
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
