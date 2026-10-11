#!/usr/bin/env node
/**
 * P0: signed-in header tabs regression probe (prod).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/self/media/staff-app/p0-tabs-regression-2026-10-11",
);
mkdirSync(outDir, { recursive: true });

const SWITCHES = Number(process.env.P0_TAB_SWITCHES || "10");
const MAX_MS = 30_000;

const viewports = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "phone-390", width: 390, height: 844 },
];

const users = [
  { role: "customer", email: "user@demo.com", password: "demo123456" },
  { role: "staff", email: "staff@demo.com", password: "demo123456" },
];

const staffTabs = ["Machines", "Care", "Directory", "Parts", "Quotes"];
const customerTabs = ["Machines", "Care", "Quotes", "Notifications"];

async function signIn(page, email, password) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(staff\/quotes|machines|quotes)/, { timeout: 60_000 });
}

async function waitContent(page) {
  await page
    .locator('[aria-busy="true"]')
    .first()
    .waitFor({ state: "detached", timeout: MAX_MS })
    .catch(() => undefined);
  await page.waitForTimeout(100);
}

async function clickTab(page, name) {
  const link = page.getByRole("link", { name }).first();
  await link.click();
}

async function runScenario(browserType, browserName, user, vp, mode) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    baseURL: baseUrl,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("requestfailed", (req) => {
    failedRequests.push({ url: req.url(), failure: req.failure()?.errorText });
  });

  const tabs = user.role === "staff" ? staffTabs : customerTabs;
  const timings = [];
  let ok = true;
  let stuckReason;

  try {
    await signIn(page, user.email, user.password);
    if (mode === "hard") {
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await context.clearCookies();
      await signIn(page, user.email, user.password);
    }

    for (let i = 0; i < SWITCHES; i++) {
      for (const tab of tabs) {
        const t0 = performance.now();
        try {
          await clickTab(page, tab);
          await page.waitForLoadState("networkidle", { timeout: MAX_MS }).catch(() => undefined);
          await waitContent(page);
          const url = page.url();
          const hasNextError = await page.locator("#__next_error__").count();
          const hasH1 = await page.locator("h1").first().isVisible().catch(() => false);
          const ms = Math.round(performance.now() - t0);
          timings.push({ i, tab, ms, url, hasNextError, hasH1 });
          if (hasNextError > 0 || !hasH1) {
            ok = false;
            stuckReason = `tab=${tab} url=${url} nextError=${hasNextError} h1=${hasH1}`;
            const shot = resolve(
              outDir,
              `${browserName}-${user.role}-${vp.name}-${mode}-fail-${tab.replace(/\s/g, "")}-i${i}.png`,
            );
            await page.screenshot({ path: shot, fullPage: true });
          }
        } catch (err) {
          ok = false;
          stuckReason = String(err);
          timings.push({ i, tab, error: stuckReason });
        }
      }
    }

    const summaryShot = resolve(
      outDir,
      `${browserName}-${user.role}-${vp.name}-${mode}-final.png`,
    );
    await page.screenshot({ path: summaryShot, fullPage: true });
  } finally {
    await browser.close();
  }

  const result = {
    browser: browserName,
    role: user.role,
    viewport: vp.name,
    mode,
    ok,
    stuckReason,
    timings,
    consoleErrors: consoleErrors.slice(0, 20),
    failedRequests: failedRequests.slice(0, 20),
  };
  const outFile = resolve(
    outDir,
    `${browserName}-${user.role}-${vp.name}-${mode}.json`,
  );
  writeFileSync(outFile, JSON.stringify(result, null, 2));
  return result;
}

const results = [];
for (const browserEntry of [
  { name: "chromium", type: chromium },
  { name: "webkit", type: webkit },
]) {
  for (const user of users) {
    for (const vp of viewports) {
      for (const mode of ["warm", "hard"]) {
        console.log("run", browserEntry.name, user.role, vp.name, mode);
        results.push(
          await runScenario(browserEntry.type, browserEntry.name, user, vp, mode),
        );
      }
    }
  }
}

const summary = {
  at: new Date().toISOString(),
  baseUrl,
  switches: SWITCHES,
  allOk: results.every((r) => r.ok),
  results: results.map((r) => ({
    key: `${r.browser}-${r.role}-${r.viewport}-${r.mode}`,
    ok: r.ok,
    stuckReason: r.stuckReason,
    maxMs: Math.max(...(r.timings.map((t) => t.ms).filter(Boolean) || [0])),
  })),
};
writeFileSync(resolve(outDir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.allOk ? 0 : 1);
