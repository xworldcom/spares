#!/usr/bin/env node
/**
 * Step A.1 gate — Bea sd.js inject + CDP-touch parity + thread scroll / tab-bar checks.
 * Usage: node scripts/care-notes-chunk2/run-bea-live-gate.mjs [baseUrl] [outDir]
 */
import { chromium, devices } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const beaSd = readFileSync(join(__dirname, "bea-sd6.js"), "utf8");

const baseUrl = (process.argv[2] || "https://oee360.com").replace(/\/$/, "");
const outDir = process.argv[3] || "/cursor/stores/self/media/care-notes-chunk2";
const staffEmail = process.env.STAFF_EMAIL || "staff@spares.local";
const staffPassword = process.env.STAFF_PASSWORD || "SparesStaff1!";

mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

function parseZ(z) {
  const badRaw = z.match(/badSteps=([^#]*?) relMaxC=/)?.[1]?.trim() ?? "";
  const badSteps = badRaw ? badRaw.split(",").filter(Boolean) : [];
  const relMaxC = Number(z.match(/relMaxC=(\d+)/)?.[1] ?? 999);
  const relMaxS = Number(z.match(/relMaxS=(\d+)/)?.[1] ?? 999);
  return { badSteps, relMaxC, relMaxS, raw: z };
}

function gateFail(parsed, label) {
  const reasons = [];
  if (parsed.badSteps.length) reasons.push(`badSteps=${parsed.badSteps.join(",")}`);
  if (parsed.relMaxC > 4) reasons.push(`relMaxC=${parsed.relMaxC}`);
  if (parsed.relMaxS > 4) reasons.push(`relMaxS=${parsed.relMaxS}`);
  return reasons.length ? `${label}: ${reasons.join("; ")}` : null;
}

function threadSnapshotsEqual(a, b, translateDeltaPx = 0) {
  if (!a || !b) return false;
  if (a.scrollTop !== b.scrollTop) return false;
  const la = a.latest;
  const lb = b.latest;
  if (!la && !lb) return true;
  if (!la || !lb) return false;
  if (la.id !== lb.id) return false;
  return Math.abs(lb.top - la.top - translateDeltaPx) <= 2;
}

function assertThreadGate(before, afterSettle, afterHold, label, failures) {
  if (!threadSnapshotsEqual(before, afterSettle)) {
    failures.push(
      `${label}: scroll before-release vs after-settle ${JSON.stringify(before)} → ${JSON.stringify(afterSettle)}`,
    );
  }
  if (!threadSnapshotsEqual(before, afterHold)) {
    failures.push(
      `${label}: scroll before-release vs +1s ${JSON.stringify(before)} → ${JSON.stringify(afterHold)}`,
    );
  }
}

function layoutClassSwap(samples) {
  const layoutRe = /\b(is-peek|is-reply|is-full|is-out)\b/g;
  const failures = [];
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const cur = samples[i];
    if (cur[0] === "rel" || prev[0] === "mv") {
      const pClasses = (prev[5] || "").match(layoutRe)?.join(".") ?? "";
      const cClasses = (cur[5] || "").match(layoutRe)?.join(".") ?? "";
      if (pClasses && cClasses && pClasses !== cClasses) {
        const dS = Math.abs((cur[2] ?? 0) - (prev[2] ?? 0));
        const dC = Math.abs((cur[3] ?? 0) - (prev[3] ?? 0));
        if (dS > 4 || dC > 4) {
          failures.push(`${pClasses}→${cClasses} dS=${dS} dC=${dC}`);
        }
      }
    }
  }
  return failures;
}

async function login(page, quoteId) {
  const login = await page.request.post(`${baseUrl}/api/auth/login`, {
    data: { email: staffEmail, password: staffPassword },
  });
  if (!login.ok()) throw new Error(`login ${login.status()} ${await login.text()}`);
  if (baseUrl.includes("127.0.0.1") || baseUrl.includes("localhost")) {
    await page.request.post(`${baseUrl}/api/staff/quotes/preview-fixture`);
    for (let n = 1; n <= 8; n += 1) {
      await page.request.post(`${baseUrl}/api/quotes/${quoteId}/activity`, {
        data: { text: `History line ${n} for step-A gate.` },
      });
    }
  }
}

async function prepareQuote(page, quoteId) {
  await page.goto(`${baseUrl}/staff/quotes/${quoteId}?sheetDebug=1`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page.locator("[data-conversation-sheet]").first().waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(400);
  await page.evaluate(beaSd);
  return page.evaluate(() => {
    const handle = document.querySelector(".snap-sheet-handle");
    const box = handle?.getBoundingClientRect();
    const composer = document.querySelector(".imsg-composer");
    const composerH = composer ? composer.offsetHeight : 64;
    const probe = document.createElement("div");
    probe.style.paddingBottom = "env(safe-area-inset-bottom)";
    document.body.appendChild(probe);
    const safe = Number.parseFloat(getComputedStyle(probe).paddingBottom) || 0;
    document.body.removeChild(probe);
    const closeMax = Math.ceil(composerH + safe);
    const grabY = box ? Math.round(box.y + box.height / 2) : 400;
    const thread = document.querySelector(".imsg-thread li:last-of-type, .imsg-thread .imsg-row:last-of-type");
    const m0 = thread ? Math.round(thread.getBoundingClientRect().top) : null;
    return { grabY, closeMax, m0 };
  });
}

async function readThreadSnapshot(page) {
  return page.evaluate(() => {
    const body = document.querySelector(".imsg-thread--fill, .imsg-thread");
    const rows = body?.querySelectorAll(":scope > li[data-activity-id]");
    const latest = rows?.length ? rows[rows.length - 1] : null;
    return {
      scrollTop: body instanceof HTMLElement ? body.scrollTop : 0,
      latest: latest
        ? {
            id: latest.getAttribute("data-activity-id"),
            top: Math.round(latest.getBoundingClientRect().top),
          }
        : null,
    };
  });
}

async function readTabBarHit(page) {
  return page.evaluate(() => {
    const composer = document.querySelector(".imsg-composer");
    if (!(composer instanceof HTMLElement)) {
      return { hit: false, tag: null };
    }
    const r = composer.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    const el = document.elementFromPoint(x, y);
    const tab = el?.closest(".spares-tabbar");
    return { hit: Boolean(tab), tag: el?.tagName ?? null, className: el?.className ?? "" };
  });
}

async function injectCloseFullThreadGate(page, fromY, toY) {
  await page.evaluate(() => {
    window.S = [];
  });
  const beforeRelease = await page.evaluate(
    async ({ fromY, toY }) => {
      const body = document.querySelector(".imsg-thread--fill, .imsg-thread");
      const snap = () => {
        const rows = body?.querySelectorAll(":scope > li[data-activity-id]");
        const latest = rows?.length ? rows[rows.length - 1] : null;
        return {
          scrollTop: body instanceof HTMLElement ? body.scrollTop : 0,
          latest: latest
            ? {
                id: latest.getAttribute("data-activity-id"),
                top: Math.round(latest.getBoundingClientRect().top),
              }
            : null,
        };
      };
      await window.SD(fromY, toY, 5, 80, false);
      const before = snap();
      await window.UP();
      return before;
    },
    { fromY, toY },
  );
  await page.waitForFunction(
    () => {
      const sheet = document.querySelector(".conversation-sheet");
      return (
        sheet?.classList.contains("is-out") &&
        !sheet.classList.contains("is-settling") &&
        !sheet.classList.contains("is-dragging")
      );
    },
    { timeout: 15_000 },
  );
  const afterSettle = await readThreadSnapshot(page);
  await page.waitForTimeout(1000);
  const afterHold = await readThreadSnapshot(page);
  const tabHit = await readTabBarHit(page);
  const z = await page.evaluate(() => window.Z(0));
  const samples = await page.evaluate(() => window.S);
  return { beforeRelease, afterSettle, afterHold, tabHit, z, parsed: parseZ(z), samples };
}

async function injectRun(page, fromY, toY, release) {
  await page.evaluate(() => {
    window.S = [];
  });
  await page.evaluate(
    async ({ fromY, toY, release }) => {
      await window.SD(fromY, toY, 5, 80, release);
      if (!release) await window.UP();
    },
    { fromY, toY, release },
  );
  const z = await page.evaluate(() => window.Z(0));
  const samples = await page.evaluate(() => window.S);
  return { z, parsed: parseZ(z), samples };
}

async function runScenario(page, cdp, quoteId, sc) {
  const meta = await prepareQuote(page, quoteId);
  let fromY = sc.fromY == null ? null : meta.grabY;
  let toY =
    sc.name === "open-from-closed" || sc.name === "open-drag-from-closed"
      ? meta.grabY
      : sc.name === "close-full"
        ? meta.grabY + meta.closeMax
        : meta.grabY + Math.round(meta.closeMax * 0.55);
  if (sc.name === "open-drag-from-closed") {
    await injectRun(page, meta.grabY, meta.grabY + meta.closeMax, true);
    await page.evaluate(beaSd);
    const closedY = await page.evaluate(() => {
      const h = document.querySelector(".snap-sheet-handle")?.getBoundingClientRect();
      return h ? Math.round(h.y + h.height / 2) : null;
    });
    fromY = closedY;
    toY = meta.grabY;
  }
  let openFromY = null;
  if (sc.name === "open-from-closed") {
    await injectRun(page, meta.grabY, meta.grabY + meta.closeMax, true);
    await page.evaluate(beaSd);
    openFromY = await page.evaluate(() => {
      const h = document.querySelector(".snap-sheet-handle")?.getBoundingClientRect();
      return h ? Math.round(h.y + h.height / 2) : null;
    });
    fromY = openFromY;
    toY = meta.grabY;
  }
  const inj = await injectRun(page, fromY, toY, sc.release);

  await prepareQuote(page, quoteId);
  const meta2 = await page.evaluate(() => {
    const handle = document.querySelector(".snap-sheet-handle");
    const box = handle?.getBoundingClientRect();
    const composer = document.querySelector(".imsg-composer");
    const composerH = composer ? composer.offsetHeight : 64;
    const probe = document.createElement("div");
    probe.style.paddingBottom = "env(safe-area-inset-bottom)";
    document.body.appendChild(probe);
    const safe = Number.parseFloat(getComputedStyle(probe).paddingBottom) || 0;
    document.body.removeChild(probe);
    const closeMax = Math.ceil(composerH + safe);
    const grabY = box ? Math.round(box.y + box.height / 2) : 400;
    return { grabY, closeMax };
  });
  let fromY2 = sc.fromY == null || sc.fromY === "closed" ? null : meta2.grabY;
  let toY2 =
    sc.name === "open-from-closed" || sc.name === "open-drag-from-closed"
      ? meta2.grabY
      : sc.name === "close-full"
        ? meta2.grabY + meta2.closeMax
        : meta2.grabY + Math.round(meta2.closeMax * 0.55);
  if (sc.name === "open-from-closed" || sc.name === "open-drag-from-closed") {
    await injectRun(page, meta2.grabY, meta2.grabY + meta2.closeMax, true);
    await page.evaluate(beaSd);
    fromY2 = await page.evaluate(() => {
      const h = document.querySelector(".snap-sheet-handle")?.getBoundingClientRect();
      return h ? Math.round(h.y + h.height / 2) : null;
    });
    toY2 = meta2.grabY;
  }
  const startY = fromY2 ?? meta2.grabY + meta2.closeMax;
  const x = Math.round(((await page.viewportSize())?.width ?? 390) / 2);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y: startY, radiusX: 1, radiusY: 1, force: 1, id: 0 }],
  });
  const cdpR = await injectRun(page, fromY2, toY2, sc.release);
  return { meta, inj, cdpR };
}

async function runViewport(width, height, label) {
  const browser = await chromium.launch({ headless: true });
  const videoDir = join(outDir, "videos");
  mkdirSync(videoDir, { recursive: true });
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    viewport: { width, height },
    recordVideo: { dir: videoDir, size: { width, height } },
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const quoteId = "quote-preview-qa-conversation";
  await login(page, quoteId);

  const scenarios = [
    { name: "close-mid-release", fromY: "grab", release: false },
    { name: "close-full", fromY: "grab", release: true },
    { name: "open-from-closed", fromY: null, release: true },
    { name: "open-drag-from-closed", fromY: "closed", release: true },
  ];

  const failures = [];
  const log = { label, width, height, runs: [] };
  let m0Baseline = null;

  for (const sc of scenarios) {
    const { meta, inj, cdpR } = await runScenario(page, cdp, quoteId, sc);
    if (sc.name === "close-mid-release") m0Baseline = meta.m0;
    if (sc.name === "close-full") {
      await prepareQuote(page, quoteId);
      const metaClose = await page.evaluate(() => {
        const handle = document.querySelector(".snap-sheet-handle");
        const box = handle?.getBoundingClientRect();
        const composer = document.querySelector(".imsg-composer");
        const composerH = composer ? composer.offsetHeight : 64;
        const probe = document.createElement("div");
        probe.style.paddingBottom = "env(safe-area-inset-bottom)";
        document.body.appendChild(probe);
        const safe = Number.parseFloat(getComputedStyle(probe).paddingBottom) || 0;
        document.body.removeChild(probe);
        const closeMax = Math.ceil(composerH + safe);
        const grabY = box ? Math.round(box.y + box.height / 2) : 400;
        return { grabY, closeMax };
      });
      const threadGate = await injectCloseFullThreadGate(
        page,
        metaClose.grabY,
        metaClose.grabY + metaClose.closeMax,
      );
      assertThreadGate(
        threadGate.beforeRelease,
        threadGate.afterSettle,
        threadGate.afterHold,
        `${label}/close-full-thread`,
        failures,
      );
      if (!threadGate.tabHit.hit) {
        failures.push(
          `${label}/close-full-tab: elementFromPoint composer center not tab bar (${JSON.stringify(threadGate.tabHit)})`,
        );
      }
      const threadInjFail = gateFail(threadGate.parsed, "close-full-thread-inject");
      if (threadInjFail) failures.push(`${label}/close-full-thread: ${threadInjFail}`);
      log.runs.push({
        scenario: "close-full-thread-gate",
        beforeRelease: threadGate.beforeRelease,
        afterSettle: threadGate.afterSettle,
        afterHold: threadGate.afterHold,
        tabHit: threadGate.tabHit,
        injectZ: threadGate.z,
      });
    }
    const injFail = gateFail(inj.parsed, "inject");
    const cdpFail = gateFail(cdpR.parsed, "cdp");
    const classFail = layoutClassSwap(inj.samples);
    if (injFail) failures.push(`${label}/${sc.name}: ${injFail}`);
    if (cdpFail) failures.push(`${label}/${sc.name}: ${cdpFail}`);
    if (classFail.length) failures.push(`${label}/${sc.name} class: ${classFail.join("; ")}`);
    if (inj.parsed.badSteps.length !== cdpR.parsed.badSteps.length) {
      failures.push(`${label}/${sc.name}: inject/cdp badSteps mismatch`);
    }
    if (sc.name === "open-drag-from-closed") {
      const snap = await page.evaluate(() => document.querySelector(".conversation-sheet")?.className ?? "");
      if (!snap.includes("is-reply") || snap.includes("is-out")) {
        failures.push(`${label}/${sc.name}: expected open is-reply without is-out, got ${snap}`);
      }
    }
    log.runs.push({ scenario: sc.name, injectZ: inj.z, cdpZ: cdpR.z });
    console.log(`\n[${label}] ${sc.name}\nINJECT: ${inj.z}\nCDP: ${cdpR.z}`);
  }

  if (m0Baseline != null) {
    const m1 = await page.evaluate(() => {
      const thread = document.querySelector(".imsg-thread li:last-of-type, .imsg-thread .imsg-row:last-of-type");
      return thread ? Math.round(thread.getBoundingClientRect().top) : null;
    });
    const snap = await page.evaluate(() => document.querySelector(".conversation-sheet")?.className ?? "");
    if (snap.includes("is-reply") && m1 != null && Math.abs(m1 - m0Baseline) > 4) {
      failures.push(`${label}: message top drift ${m0Baseline}→${m1}`);
    }
  }

  const video = await page.video()?.path();
  await context.close();
  await browser.close();
  return { log, failures, video };
}

const results = [];
for (const [w, h, label] of [
  [390, 844, "390"],
  [320, 568, "320"],
]) {
  results.push(await runViewport(w, h, label));
}

const reportPath = join(outDir, `step-a1-bea-gate-${stamp}.json`);
writeFileSync(reportPath, JSON.stringify({ baseUrl, stamp, results }, null, 2));

const allFailures = results.flatMap((r) => r.failures);
if (allFailures.length) {
  console.error("\nSTEP A.1 GATE FAIL:\n" + allFailures.join("\n"));
  process.exit(1);
}
console.log("\nSTEP A.1 GATE PASS", reportPath);
