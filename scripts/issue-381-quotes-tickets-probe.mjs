#!/usr/bin/env node
/**
 * Issue #381: Quotes ↔ Tickets tab switches must finish <1s (no 304 warm-read deadlock).
 * Browsers: chromium + webkit. Users: user@demo.com, staff@demo.com. Viewports: 1440, 390.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/bc-7479d24f-d92e-51f0-ab53-0ec629d66015/media/staff-app/issue-381-safari-304",
);
mkdirSync(outDir, { recursive: true });

const MACHINE = "hardware-fixture";
const SWITCHES = 10;
const MAX_MS = 1000;

const viewports = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "phone-390", width: 390, height: 844 },
];

const users = [
  { role: "customer", email: "user@demo.com", password: "demo123456" },
  { role: "staff", email: "staff@demo.com", password: "demo123456" },
];

async function signIn(page, email, password) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(staff\/quotes|machines|quotes)/, { timeout: 60_000 });
}

async function waitQuotesReady(page) {
  await page
    .getByRole("navigation", { name: "Machine" })
    .getByRole("link", { name: "Quotes" })
    .waitFor({ timeout: 30_000 });
  await page.locator('[aria-busy="true"][aria-label="Loading quotes"]').waitFor({
    state: "detached",
    timeout: 30_000,
  });
}

async function waitTicketsReady(page) {
  await page.locator('[aria-busy="true"]').first().waitFor({
    state: "detached",
    timeout: 30_000,
  });
}

async function machineTabSwitch(page, tabName) {
  const t0 = performance.now();
  await page.getByRole("navigation", { name: "Machine" }).getByRole("link", { name: tabName }).click();
  if (tabName === "Quotes") {
    await waitQuotesReady(page);
  } else {
    await waitTicketsReady(page);
  }
  return Math.round(performance.now() - t0);
}

async function topHeaderSwitch(page, role, tabName) {
  const t0 = performance.now();
  if (role === "staff") {
    if (tabName === "Quotes") {
      await page.getByRole("link", { name: "Quotes" }).first().click();
      await page.waitForURL(/\/staff\/quotes/, { timeout: 30_000 });
    } else {
      await page.getByRole("link", { name: "Care" }).first().click();
      await page.waitForURL(/\/care/, { timeout: 30_000 });
    }
  } else {
    if (tabName === "Quotes") {
      await page.getByRole("link", { name: "Quotes" }).first().click();
      await page.waitForURL(/\/quotes/, { timeout: 30_000 });
    } else {
      await page.getByRole("link", { name: "Care" }).first().click();
      await page.waitForURL(/\/care/, { timeout: 30_000 });
    }
  }
  await page.locator('[aria-busy="true"]').first().waitFor({ state: "detached", timeout: 30_000 }).catch(() => undefined);
  return Math.round(performance.now() - t0);
}

async function runScenario(browserType, user, vp, phase) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    baseURL: baseUrl,
  });
  const page = await context.newPage();
  const timings = [];
  let ok = true;

  try {
    await signIn(page, user.email, user.password);
    const quotesPath =
      user.role === "staff"
        ? `/machines/${MACHINE}/quotes`
        : `/machines/${MACHINE}/quotes`;
    await page.goto(quotesPath);
    await waitQuotesReady(page);

    for (let i = 0; i < SWITCHES; i++) {
      const toTickets = await machineTabSwitch(page, "Tickets");
      const toQuotes = await machineTabSwitch(page, "Quotes");
      timings.push({ i, toTickets, toQuotes });
      if (toTickets >= MAX_MS || toQuotes >= MAX_MS) {
        ok = false;
      }
    }

    if (phase === "header") {
      for (let i = 0; i < SWITCHES; i++) {
        const toCare = await topHeaderSwitch(page, user.role, "Care");
        const toQuotes = await topHeaderSwitch(page, user.role, "Quotes");
        timings.push({ i, headerCare: toCare, headerQuotes: toQuotes });
        if (toCare >= MAX_MS || toQuotes >= MAX_MS) {
          ok = false;
        }
      }
    }
  } finally {
    await browser.close();
  }

  return {
    browser: browserType.name(),
    user: user.role,
    viewport: vp.name,
    phase,
    ok,
    timings,
  };
}

async function main() {
  const report = {
    baseUrl,
    at: new Date().toISOString(),
    maxMs: MAX_MS,
    switches: SWITCHES,
    scenarios: [],
    ok: true,
  };

  for (const browserType of [chromium, webkit]) {
    for (const user of users) {
      for (const vp of viewports) {
        for (const phase of ["machine", "header"]) {
          const row = await runScenario(browserType, user, vp, phase);
          report.scenarios.push(row);
          if (!row.ok) {
            report.ok = false;
          }
        }
      }
    }
  }

  const outPath = `${outDir}/probe-results.json`;
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, outPath, scenarios: report.scenarios.length }, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
