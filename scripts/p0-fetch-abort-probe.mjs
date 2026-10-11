#!/usr/bin/env node
/**
 * P0 fetch-abort / loading hang probe (prod).
 *
 * Matrix modes (P0_MATRIX_MODE):
 *   sequential  — one browser cell at a time (8 cells)
 *   parallel-4  — up to 4 cells concurrently
 *   parallel-8  — all 8 cells concurrently
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/self/media/staff-app/p0-fetch-abort-2026-10-11",
);
mkdirSync(outDir, { recursive: true });

const SWITCHES = Number(process.env.P0_TAB_SWITCHES || "10");
const MAX_MS = Number(process.env.P0_LOAD_MAX_MS || 15_000);
const MATRIX_MODE = process.env.P0_MATRIX_MODE || "sequential";

const viewports = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "phone-390", width: 390, height: 844 },
];

const users = [
  { role: "customer", email: "user@demo.com", password: "demo123456" },
  { role: "staff", email: "staff@demo.com", password: "demo123456" },
];

const routes = {
  customer: ["/machines", "/care/tickets", "/quotes", "/notifications", "/quotes/34"],
  staff: ["/machines", "/care/tickets", "/staff/quotes", "/staff/quotes/34", "/staff/parts"],
};

function batchSizeForMode() {
  if (MATRIX_MODE === "parallel-8") {
    return 8;
  }
  if (MATRIX_MODE === "parallel-4") {
    return 4;
  }
  return 1;
}

function isPhone(vp) {
  return vp.width < 500;
}

function tabCycle(role, vp) {
  const phone = isPhone(vp);
  if (role === "staff") {
    return ["Care", "Quotes"];
  }
  return phone
    ? ["Machines", "Care", "Quotes", "Alerts"]
    : ["Machines", "Care", "Quotes", "Notifications"];
}

async function signIn(page, email, password) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(staff\/quotes|machines|quotes)/, { timeout: 60_000 });
}

async function waitLoaded(page) {
  const busy = page.locator('[aria-busy="true"]').first();
  const start = Date.now();
  try {
    await busy.waitFor({ state: "detached", timeout: MAX_MS });
  } catch {
    return { ok: false, ms: Date.now() - start, reason: "aria-busy stuck" };
  }
  return { ok: true, ms: Date.now() - start };
}

async function clickNav(page, name, role, vp) {
  if (role === "staff" && name === "Machines" && isPhone(vp)) {
    await page.getByRole("button", { name: "Machines" }).click();
    return;
  }
  await page.getByRole("link", { name }).first().click({ timeout: 30_000 });
}

function attachDiagnostics(page, bucket) {
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      bucket.consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    bucket.pageErrors.push(String(err));
  });
  page.on("requestfailed", (req) => {
    bucket.failedRequests.push({
      url: req.url(),
      failure: req.failure()?.errorText ?? "unknown",
    });
  });
}

async function runCell(browserType, browserName, user, vp) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    baseURL: baseUrl,
  });
  const page = await context.newPage();
  const diagnostics = { consoleErrors: [], pageErrors: [], failedRequests: [] };
  attachDiagnostics(page, diagnostics);
  const rows = [];
  try {
    await signIn(page, user.email, user.password);
    for (const href of routes[user.role]) {
      await page.goto(href, { waitUntil: "domcontentloaded" });
      const cold = await waitLoaded(page);
      rows.push({
        href,
        kind: "cold",
        ok: cold.ok,
        ms: cold.ms,
        reason: cold.reason,
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      const reload = await waitLoaded(page);
      rows.push({
        href,
        kind: "reload",
        ok: reload.ok,
        ms: reload.ms,
        reason: reload.reason,
      });
    }
    const tabs = tabCycle(user.role, vp);
    for (let i = 0; i < SWITCHES; i += 1) {
      const name = tabs[i % tabs.length];
      const start = Date.now();
      try {
        await clickNav(page, name, user.role, vp);
        const tab = await waitLoaded(page);
        rows.push({
          href: `tab:${name}`,
          kind: "tab",
          ok: tab.ok,
          ms: tab.ms,
          reason: tab.reason,
        });
      } catch (cause) {
        rows.push({
          href: `tab:${name}`,
          kind: "tab",
          ok: false,
          ms: Date.now() - start,
          reason: cause instanceof Error ? cause.message : String(cause),
        });
      }
    }
  } finally {
    await browser.close();
  }
  const file = resolve(outDir, `${browserName}-${user.role}-${vp.name}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      {
        matrixMode: MATRIX_MODE,
        rows,
        diagnostics,
        elapsed: rows.reduce((s, r) => s + r.ms, 0),
      },
      null,
      2,
    ),
  );
  const failed = rows.filter((r) => !r.ok);
  const unhandledReachability = diagnostics.consoleErrors.filter((line) =>
    line.includes("Could not reach OEE360"),
  );
  return {
    file,
    failed,
    rows,
    browserName,
    role: user.role,
    viewport: vp.name,
    unhandledReachability,
  };
}

async function runCellSafe(job) {
  mkdirSync(outDir, { recursive: true });
  try {
    return await runCell(job.browserType, job.browserName, job.user, job.vp);
  } catch (cause) {
    const file = resolve(
      outDir,
      `${job.browserName}-${job.user.role}-${job.vp.name}.json`,
    );
    const message = cause instanceof Error ? cause.message : String(cause);
    writeFileSync(file, JSON.stringify({ fatal: message, rows: [] }, null, 2));
    return {
      file,
      failed: [{ ok: false }],
      rows: [],
      browserName: job.browserName,
      role: job.user.role,
      viewport: job.vp.name,
      fatal: message,
      unhandledReachability: [],
    };
  }
}

async function runJobs(jobs) {
  const batchSize = batchSizeForMode();
  const results = [];
  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize);
    results.push(...(await Promise.all(batch.map((job) => runCellSafe(job)))));
  }
  return results;
}

async function main() {
  const jobs = [];
  for (const browserType of [chromium, webkit]) {
    const browserName = browserType === chromium ? "chromium" : "webkit";
    for (const user of users) {
      for (const vp of viewports) {
        jobs.push({ browserType, browserName, user, vp });
      }
    }
  }
  const started = Date.now();
  const results = await runJobs(jobs);

  const summary = results.map((r) => ({
    file: r.file,
    cell: `${r.browserName}-${r.role}-${r.viewport}`,
    failures: r.failed.length,
    fatal: r.fatal ?? null,
    medianMs: median(r.rows.map((row) => row.ms)),
    tabMedianMs: median(r.rows.filter((row) => row.kind === "tab").map((row) => row.ms)),
    routeMedianMs: median(
      r.rows.filter((row) => row.kind === "cold" || row.kind === "reload").map((row) => row.ms),
    ),
    unhandledReachability: r.unhandledReachability?.length ?? 0,
  }));
  const aggregate = {
    matrixMode: MATRIX_MODE,
    batchSize: batchSizeForMode(),
    wallMs: Date.now() - started,
    totalFail: results.reduce((n, r) => n + r.failed.length, 0),
    tabMedianMs: median(summary.map((row) => row.tabMedianMs)),
    routeMedianMs: median(summary.map((row) => row.routeMedianMs)),
    cells: summary,
  };
  writeFileSync(resolve(outDir, "summary.json"), JSON.stringify(aggregate, null, 2));
  console.log(JSON.stringify({ outDir, ...aggregate }, null, 2));
  process.exit(aggregate.totalFail > 0 ? 1 : 0);
}

function median(values) {
  const sorted = [...values].filter((v) => v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return 0;
  }
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
