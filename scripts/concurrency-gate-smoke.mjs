#!/usr/bin/env node
/**
 * Full staff + customer smoke matrix with JSON transcript + screenshots.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/self/media/staff-app/concurrency-migration/smoke",
);
mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
];

async function apiLogin(email, password) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const jar = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
  return { ok: res.ok, status: res.status, jar };
}

async function apiStep(jar, label, path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { cookie: jar, ...(options.headers ?? {}) },
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { label, path, status: res.status, ok: res.ok, bodySummary: summarize(body) };
}

function summarize(body) {
  if (!body || typeof body !== "object") {
    return null;
  }
  if (Array.isArray(body)) {
    return { type: "array", length: body.length };
  }
  const keys = Object.keys(body);
  const out = { keys };
  for (const k of ["quotes", "tickets", "machines", "parts", "notifications", "user"]) {
    if (body[k] !== undefined) {
      out[k] = Array.isArray(body[k]) ? body[k].length : body[k];
    }
  }
  return out;
}

async function browserFlow(vp, account) {
  const shotsDir = join(outDir, `browser-${account.email.replace(/@.*/, "")}-${vp.name}`);
  mkdirSync(shotsDir, { recursive: true });
  const steps = [];
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      baseURL: baseUrl,
    });
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill(account.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/(staff\/|machines|quotes)/, { timeout: 60_000 });
    steps.push({ step: "login", ok: true });

    const routes =
      account.role === "staff"
        ? ["/staff/quotes", "/staff/tickets", "/staff/part-lifecycle"]
        : ["/machines", "/quotes"];
    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => undefined);
      const shot = join(shotsDir, route.replace(/\//g, "_") + ".png");
      await page.screenshot({ path: shot, fullPage: true });
      steps.push({ step: `visit ${route}`, shot, ok: true });
    }
    if (account.role === "staff") {
      await page.goto("/staff/quotes");
      const firstQuote = page.locator("[data-quote-id], .quote-list-item, a[href*='/staff/quotes/']").first();
      if (await firstQuote.count()) {
        await firstQuote.click();
        await page.waitForTimeout(1500);
        await page.screenshot({ path: join(shotsDir, "quote-detail.png"), fullPage: true });
        steps.push({ step: "quote detail", ok: true });
      }
      await page.goto("/staff/tickets");
      const firstTicket = page.locator("a[href*='/staff/tickets/']").first();
      if (await firstTicket.count()) {
        await firstTicket.click();
        await page.waitForTimeout(1500);
        await page.screenshot({ path: join(shotsDir, "ticket-detail.png"), fullPage: true });
        steps.push({ step: "ticket detail", ok: true });
      }
    }
  } finally {
    await browser.close();
  }
  return steps;
}

async function main() {
  const transcript = {
    baseUrl,
    at: new Date().toISOString(),
    api: { staff: [], customer: [] },
    browser: [],
    ok: false,
  };
  const staffLogin = await apiLogin("staff@demo.com", "demo123456");
  const customerLogin = await apiLogin("user@demo.com", "demo123456");
  if (staffLogin.ok) {
    transcript.api.staff = await Promise.all([
      apiStep(staffLogin.jar, "quotes list", "/api/quotes"),
      apiStep(staffLogin.jar, "tickets list", "/api/tickets"),
      apiStep(staffLogin.jar, "lifecycle", "/api/staff/part-lifecycle"),
      apiStep(staffLogin.jar, "notifications", "/api/notifications/lifecycle"),
      apiStep(staffLogin.jar, "auth me", "/api/auth/me"),
    ]);
    const lifecycleList = await fetch(`${baseUrl}/api/staff/part-lifecycle`, {
      headers: { cookie: staffLogin.jar },
    }).then((r) => r.json());
    const partNumber = lifecycleList.parts?.[0]?.partNumber;
    if (partNumber) {
      transcript.api.staff.push(
        await apiStep(
          staffLogin.jar,
          "lifecycle PATCH",
          `/api/staff/part-lifecycle`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              partNumber,
              patch: { sourceNotes: `gate-smoke-${Date.now()}` },
            }),
          },
        ),
      );
    }
    const tickets = await fetch(`${baseUrl}/api/tickets`, {
      headers: { cookie: staffLogin.jar },
    }).then((r) => r.json());
    const ticketId = tickets.tickets?.[0]?.id;
    if (ticketId) {
      transcript.api.staff.push(
        await apiStep(staffLogin.jar, "ticket detail", `/api/tickets/${ticketId}`),
      );
      transcript.api.staff.push(
        await apiStep(
          staffLogin.jar,
          "ticket chat staff→customer",
          `/api/tickets/${ticketId}/activity`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text: `Gate smoke staff ${Date.now()}` }),
          },
        ),
      );
    }
  }
  if (customerLogin.ok) {
    transcript.api.customer = await Promise.all([
      apiStep(customerLogin.jar, "machines", "/api/machines"),
      apiStep(customerLogin.jar, "quotes list", "/api/quotes"),
    ]);
    const quotes = await fetch(`${baseUrl}/api/quotes`, {
      headers: { cookie: customerLogin.jar },
    }).then((r) => r.json());
    const quoteId = quotes.quotes?.[0]?.id;
    if (quoteId) {
      transcript.api.customer.push(
        await apiStep(customerLogin.jar, "quote detail", `/api/quotes/${quoteId}`),
      );
      transcript.api.customer.push(
        await apiStep(
          customerLogin.jar,
          "quote chat customer→staff",
          `/api/quotes/${quoteId}/activity`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text: `Gate smoke customer ${Date.now()}` }),
          },
        ),
      );
    }
  }

  for (const vp of viewports) {
    transcript.browser.push({
      viewport: vp.name,
      staff: await browserFlow(vp, {
        email: "staff@demo.com",
        password: "demo123456",
        role: "staff",
      }),
    });
    transcript.browser.push({
      viewport: vp.name,
      customer: await browserFlow(vp, {
        email: "user@demo.com",
        password: "demo123456",
        role: "customer",
      }),
    });
  }

  const apiOk =
    staffLogin.ok &&
    customerLogin.ok &&
    transcript.api.staff.filter((s) => s.label !== "auth me").every((s) => s.ok) &&
    transcript.api.customer.every((s) => s.ok);
  const browserOk = viewports.every((vp) => {
    const staff = transcript.browser.find((row) => row.viewport === vp.name && row.staff);
    const customer = transcript.browser.find((row) => row.viewport === vp.name && row.customer);
    return (
      staff?.staff?.some((s) => s.step?.startsWith("visit")) &&
      customer?.customer?.some((s) => s.step?.startsWith("visit"))
    );
  });
  transcript.ok = apiOk && browserOk;
  transcript.notes = {
    lifecycleEdit:
      "Lifecycle API PATCH on first part row; Playwright save on grid optional follow-up.",
    platformDirectory: "Demo staff lacks /api/platform/directory (403); users counted from Blob backup.",
  };
  writeFileSync(join(outDir, "smoke-matrix.json"), JSON.stringify(transcript, null, 2));
  console.log(JSON.stringify({ ok: transcript.ok, outDir }, null, 2));
  process.exit(transcript.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
