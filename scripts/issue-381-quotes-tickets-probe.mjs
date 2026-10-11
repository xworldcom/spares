#!/usr/bin/env node
/**
 * Issue #381: machine Quotes ↔ Tickets must finish <1s (no 304 warm-read deadlock).
 * Also records top-header Care ↔ Quotes (informational; can exceed 1s on prod quote list).
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
const MACHINE_MAX_MS = 1000;
const HEADER_MAX_MS = 15_000;

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
  await page
    .getByRole("navigation", { name: "Machine" })
    .getByRole("link", { name: tabName })
    .click();
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
      await page.waitForURL(/\/staff\/quotes/, { timeout: HEADER_MAX_MS });
    } else {
      await page.getByRole("link", { name: "Care" }).first().click();
      await page.waitForURL(/\/care/, { timeout: HEADER_MAX_MS });
    }
  } else {
    if (tabName === "Quotes") {
      await page.getByRole("link", { name: "Quotes" }).first().click();
      await page.waitForURL(/\/quotes/, { timeout: HEADER_MAX_MS });
    } else {
      await page.getByRole("link", { name: "Care" }).first().click();
      await page.waitForURL(/\/care/, { timeout: HEADER_MAX_MS });
    }
  }
  await page
    .locator('[aria-busy="true"]')
    .first()
    .waitFor({ state: "detached", timeout: HEADER_MAX_MS })
    .catch(() => undefined);
  return Math.round(performance.now() - t0);
}

async function runMachineScenario(browserType, user, vp) {
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
    const coldStart = performance.now();
    await page.goto(`/machines/${MACHINE}/quotes`);
    await waitQuotesReady(page);
    const coldLoadMs = Math.round(performance.now() - coldStart);

    // Warm pair (not gated)
    await machineTabSwitch(page, "Tickets");
    await machineTabSwitch(page, "Quotes");

    for (let i = 0; i < SWITCHES; i++) {
      const toTickets = await machineTabSwitch(page, "Tickets");
      const toQuotes = await machineTabSwitch(page, "Quotes");
      timings.push({ i, toTickets, toQuotes });
      if (toTickets >= MACHINE_MAX_MS || toQuotes >= MACHINE_MAX_MS) {
        ok = false;
      }
    }

    return {
      browser: browserType.name(),
      user: user.role,
      viewport: vp.name,
      phase: "machine",
      coldLoadMs,
      ok,
      timings,
    };
  } finally {
    await browser.close();
  }
}

async function runHeaderScenario(browserType, user, vp) {
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
    await page.goto(`/machines/${MACHINE}/quotes`);
    await waitQuotesReady(page);

    for (let i = 0; i < SWITCHES; i++) {
      const toCare = await topHeaderSwitch(page, user.role, "Care");
      const toQuotes = await topHeaderSwitch(page, user.role, "Quotes");
      timings.push({ i, headerCare: toCare, headerQuotes: toQuotes });
      if (toCare >= HEADER_MAX_MS || toQuotes >= HEADER_MAX_MS) {
        ok = false;
      }
    }

    return {
      browser: browserType.name(),
      user: user.role,
      viewport: vp.name,
      phase: "header",
      ok,
      timings,
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  const report = {
    baseUrl,
    at: new Date().toISOString(),
    machineMaxMs: MACHINE_MAX_MS,
    headerMaxMs: HEADER_MAX_MS,
    switches: SWITCHES,
    scenarios: [],
    machineOk: true,
    headerOk: true,
    ok: true,
  };

  for (const browserType of [chromium, webkit]) {
    for (const user of users) {
      for (const vp of viewports) {
        const machine = await runMachineScenario(browserType, user, vp);
        report.scenarios.push(machine);
        if (!machine.ok) {
          report.machineOk = false;
        }
        const header = await runHeaderScenario(browserType, user, vp);
        report.scenarios.push(header);
        if (!header.ok) {
          report.headerOk = false;
        }
      }
    }
  }

  report.ok = report.machineOk;
  const outPath = `${outDir}/probe-results.json`;
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        ok: report.ok,
        machineOk: report.machineOk,
        headerOk: report.headerOk,
        outPath,
        scenarios: report.scenarios.length,
      },
      null,
      2,
    ),
  );
  process.exit(report.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
