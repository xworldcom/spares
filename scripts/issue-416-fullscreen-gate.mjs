#!/usr/bin/env node
/**
 * Issue #416 — Chromium @ 1440 fullscreen enter/exit gate (local prod server + disposable store).
 *
 * Prereq: ./scripts/issue-416-fullscreen-gate-server.sh (or build + start with SPARES_DATA_DIR set)
 *
 * Env:
 *   ISSUE_416_BASE     default http://127.0.0.1:3016
 *   ISSUE_416_OUT      default /cursor/stores/self/media/issue-416-fs-gate/chromium
 *   ISSUE_416_EMAIL    default customer@spares.local
 *   ISSUE_416_PASSWORD default SparesCustomer1!
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const candidate of [
    "playwright",
    join(process.cwd(), "node_modules/playwright"),
  ]) {
    try {
      return require(candidate);
    } catch {
      continue;
    }
  }
  throw new Error("Install playwright: npm install playwright");
}

const browserName = process.env.ISSUE_416_BROWSER === "webkit" ? "webkit" : "chromium";
const { chromium, webkit } = loadPlaywright();

const BASE = process.env.ISSUE_416_BASE ?? "http://127.0.0.1:3016";
const OUT =
  process.env.ISSUE_416_OUT ??
  "/cursor/stores/self/media/issue-416-fs-gate/chromium";
const CREDS = {
  email: process.env.ISSUE_416_EMAIL ?? "customer@spares.local",
  password: process.env.ISSUE_416_PASSWORD ?? "SparesCustomer1!",
};
const MACHINES = ["hardware-fixture", "palletizer"];
const CYCLES = 3;
const VIEWPORT = { width: 1440, height: 900 };

const results = [];

function check(label, ok, detail = "") {
  results.push({ label, ok, detail });
  console.log(ok ? "PASS" : "FAIL", label, detail);
}

async function readMetrics(page) {
  return page.evaluate(() => {
    const layout = document.querySelector("[data-machine-viewer-layout]");
    const chrome = document.querySelector(".machine-viewer");
    const stage = document.querySelector(".machine-stage");
    return {
      innerHeight: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
      layoutHeight: layout ? Math.round(layout.getBoundingClientRect().height) : 0,
      chromeHeight: chrome ? Math.round(chrome.getBoundingClientRect().height) : 0,
      stageHeight: stage ? Math.round(stage.getBoundingClientRect().height) : 0,
      fullscreen: Boolean(
        document.fullscreenElement || document.webkitFullscreenElement,
      ),
      canonicalReady: layout?.getAttribute("data-viewer-canonical-ready") === "true",
    };
  });
}

async function apiLogin(context) {
  const res = await context.request.post(`${BASE}/api/auth/login`, { data: CREDS });
  if (!res.ok()) {
    throw new Error(`login failed ${res.status()}`);
  }
}

async function runMachine(browser, machineId) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    ignoreHTTPSErrors: true,
  });
  try {
    await context.grantPermissions(["fullscreen"], { origin: new URL(BASE).origin });
  } catch {
    // Playwright builds without a fullscreen permission still exercise Element.requestFullscreen.
  }
  await apiLogin(context);
  const page = await context.newPage();

  const machineDir = join(OUT, machineId);
  await mkdir(machineDir, { recursive: true });

  await page.goto(`${BASE}/machines/${machineId}`, { waitUntil: "domcontentloaded" });
  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(2000);

  const baseline = await readMetrics(page);
  await page.screenshot({
    path: join(machineDir, "00-baseline.png"),
    fullPage: true,
  });

  const enterBtn = page.getByRole("button", { name: /Enter full screen/i });
  const exitBtn = page.getByRole("button", { name: /Exit full screen/i });

  for (let cycle = 1; cycle <= CYCLES; cycle++) {
    const tag = `cycle-${cycle}`;
    await enterBtn.click();
    await page.waitForFunction(
      () => Boolean(document.fullscreenElement || document.webkitFullscreenElement),
      { timeout: 10_000 },
    );
    await page.waitForTimeout(800);
    const inFs = await readMetrics(page);
    await page.screenshot({
      path: join(machineDir, `${tag}-in-fullscreen.png`),
      fullPage: true,
    });

    await exitBtn.click();
    await page.waitForFunction(
      () => !document.fullscreenElement && !document.webkitFullscreenElement,
      { timeout: 10_000 },
    );
    await page.waitForTimeout(1200);
    const outFs = await readMetrics(page);
    await page.screenshot({
      path: join(machineDir, `${tag}-after-exit.png`),
      fullPage: true,
    });

    const heightDelta = Math.abs(outFs.layoutHeight - baseline.layoutHeight);
    check(
      `${machineId} ${tag} layout height near baseline after exit`,
      heightDelta <= 12,
      `baseline=${baseline.layoutHeight} after=${outFs.layoutHeight} delta=${heightDelta}`,
    );
    check(
      `${machineId} ${tag} not stuck at viewport height after exit`,
      outFs.layoutHeight < outFs.innerHeight - 40,
      `layout=${outFs.layoutHeight} innerH=${outFs.innerHeight}`,
    );
    check(
      `${machineId} ${tag} scroll height reasonable`,
      outFs.scrollHeight <= outFs.innerHeight + 80,
      `scroll=${outFs.scrollHeight} innerH=${outFs.innerHeight}`,
    );
    check(
      `${machineId} ${tag} viewer canonical ready after exit`,
      !baseline.canonicalReady || outFs.canonicalReady,
      `baseline=${baseline.canonicalReady} after=${outFs.canonicalReady}`,
    );

    await writeFile(
      join(machineDir, `${tag}-metrics.json`),
      JSON.stringify({ baseline, inFs, outFs }, null, 2),
    );
  }

  await context.close();
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const launchOptions = {
    headless: process.env.ISSUE_416_HEADED === "1" ? false : true,
    channel: process.env.ISSUE_416_CHROME_CHANNEL || undefined,
  };
  if (process.env.CHROME_BIN) {
    launchOptions.executablePath = process.env.CHROME_BIN;
    launchOptions.args = [
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--no-sandbox",
    ];
  }
  const browser =
    browserName === "webkit"
      ? await webkit.launch({ headless: launchOptions.headless })
      : await chromium.launch(launchOptions);
  try {
    for (const machineId of MACHINES) {
      await runMachine(browser, machineId);
    }
  } finally {
    await browser.close();
  }

  const summaryPath = join(OUT, "summary.json");
  await writeFile(summaryPath, JSON.stringify({ BASE, VIEWPORT, results }, null, 2));
  const failed = results.filter((row) => !row.ok);
  if (failed.length > 0) {
    console.error(`\n${failed.length} check(s) failed. See ${summaryPath}`);
    process.exit(1);
  }
  console.log(`\nAll checks passed. Evidence: ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
