#!/usr/bin/env node
/**
 * P0 fetch-abort / loading hang probe (prod).
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
const PARALLEL = process.env.P0_PARALLEL === "1";

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

async function runCell(browserType, browserName, user, vp) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    baseURL: baseUrl,
  });
  const page = await context.newPage();
  const rows = [];
  try {
    await signIn(page, user.email, user.password);
    for (const href of routes[user.role]) {
      const t0 = Date.now();
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
    const tabs =
      user.role === "staff"
        ? ["Machines", "Care", "Quotes"]
        : ["Machines", "Care", "Quotes", "Notifications"];
    for (let i = 0; i < SWITCHES; i += 1) {
      const name = tabs[i % tabs.length];
      const t0 = Date.now();
      await page.getByRole("link", { name }).first().click();
      const tab = await waitLoaded(page);
      rows.push({
        href: `tab:${name}`,
        kind: "tab",
        ok: tab.ok,
        ms: tab.ms,
        reason: tab.reason,
      });
    }
  } finally {
    await browser.close();
  }
  const file = resolve(outDir, `${browserName}-${user.role}-${vp.name}.json`);
  writeFileSync(file, JSON.stringify({ rows, elapsed: rows.reduce((s, r) => s + r.ms, 0) }, null, 2));
  const failed = rows.filter((r) => !r.ok);
  return { file, failed, rows };
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
  const results = PARALLEL
    ? await Promise.all(jobs.map((j) => runCell(j.browserType, j.browserName, j.user, j.vp)))
    : await jobs.reduce(async (prev, j) => {
        const acc = await prev;
        acc.push(await runCell(j.browserType, j.browserName, j.user, j.vp));
        return acc;
      }, Promise.resolve([]));

  const summary = results.map((r) => ({
    file: r.file,
    failures: r.failed.length,
    medianMs: median(r.rows.map((row) => row.ms)),
  }));
  writeFileSync(resolve(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  const totalFail = results.reduce((n, r) => n + r.failed.length, 0);
  console.log(JSON.stringify({ outDir, totalFail, summary }, null, 2));
  process.exit(totalFail > 0 ? 1 : 0);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
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
