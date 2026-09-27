#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const harness = join(root, ".cursor/skills/verify-oee360/scripts");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const targetUrl = arg("url", "http://127.0.0.1:3010/");
const width = Number(arg("width", "1440"));
const height = Number(arg("height", "900"));
const outPath = arg("out", "");

spawnSync("npm", ["install", "--omit=dev"], { cwd: harness, stdio: "ignore" });
spawnSync("npx", ["playwright", "install", "chromium"], { cwd: harness, stdio: "inherit" });

const require = createRequire(join(harness, "package.json"));
const { chromium } = require("playwright");

async function snapshot(page) {
  return page.evaluate(() => {
    const section = document.querySelector(".landing-demo-scrub");
    const pin = document.querySelector(".landing-demo-scrub-pin");
    const outer = document.querySelector(".landing-demo-stage.landing-workflow");
    const stage = document.querySelector(".landing-workflow-stage");
    const request = document.querySelector(".landing-workflow-request");
    const model = document.querySelector(".landing-workflow-model-panel");
    const hub = document.querySelector(".landing-workflow-hub");
    const intro = document.querySelector(".landing-stage-pin-intro");
    const part = document.querySelector("[data-part-sheet]");
    const quote = document.querySelector(".landing-workflow-quote-sheet");
    const guide = document.querySelector(".landing-workflow-guide");
    const rows = [...document.querySelectorAll(".landing-workflow-thread [data-demo-at]")];
    if (!section || !outer) {
      return { missing: true };
    }
    const varOf = (el, name) => (el ? getComputedStyle(el).getPropertyValue(name).trim() : null);
    const opacityOf = (el) => (el ? Number.parseFloat(getComputedStyle(el).opacity) : null);
    const boxOf = (el) => {
      if (!el) {
        return null;
      }
      const style = getComputedStyle(el);
      return {
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        pointerEvents: style.pointerEvents,
        touchAction: style.touchAction,
        position: style.position,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        canScroll: el.scrollHeight > el.clientHeight + 1,
      };
    };
    const strip = document.querySelector(
      ".landing-workflow-request .quote-progress-step[aria-current='step'] .quote-progress-label-full",
    );
    const guideTargetName = guide?.getAttribute("data-guide") ?? null;
    const hit = guideTargetName
      ? document.querySelector(`[data-guide-target="${guideTargetName}"]`)
      : null;
    let guideOffset = null;
    if (guide && hit) {
      const g = guide.getBoundingClientRect();
      const t = hit.getBoundingClientRect();
      guideOffset = Math.round(
        Math.hypot(g.left - (t.left + t.width / 2), g.top - (t.top + t.height / 2)),
      );
    }
    return {
      missing: false,
      progress: section.getAttribute("data-progress"),
      step: outer.getAttribute("data-step"),
      outerHandoff: varOf(outer, "--wf-handoff"),
      stageHandoff: varOf(stage, "--wf-handoff"),
      requestHandoff: varOf(request, "--wf-handoff"),
      requestVisible: Boolean(request?.classList.contains("is-visible")),
      requestOpacity: opacityOf(request),
      modelOpacity: opacityOf(model),
      modelTransform: model ? getComputedStyle(model).transform : null,
      hubPresent: Boolean(hub),
      hubText: hub?.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) ?? null,
      introOpacity: opacityOf(intro),
      introText: intro?.textContent?.replace(/\s+/g, " ").trim().slice(0, 60) ?? null,
      partPresent: Boolean(part),
      quotePresent: Boolean(quote),
      guideTarget: guideTargetName,
      guideOffset,
      visibleRows: rows.filter((row) => !row.hidden).length,
      allRows: rows.length,
      quoteStatus: strip?.textContent?.trim() ?? null,
      scrollbarWidth: window.innerWidth - document.documentElement.clientWidth,
      pinBox: boxOf(pin),
      stageBox: boxOf(stage),
      sideBox: boxOf(document.querySelector(".landing-workflow-side")),
      quoteBox: boxOf(quote),
      requestBox: boxOf(request),
      windowY: Math.round(window.scrollY),
      pageTop: Math.round(window.visualViewport?.pageTop ?? 0),
    };
  });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width, height } });
await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(800);

const samples = [];
const section = page.locator(".landing-demo-scrub").first();
if (await section.count()) {
  const box = await section.boundingBox();
  if (box) {
    const start = box.y + (await page.evaluate(() => window.scrollY));
    const track = box.height;
    for (const frac of [0.02, 0.12, 0.22, 0.32, 0.42, 0.52, 0.62, 0.7, 0.78, 0.86, 0.95]) {
      await page.evaluate((y) => window.scrollTo(0, y), start + track * frac);
      await page.waitForTimeout(260);
      samples.push({ label: `frac-${frac}`, ...(await snapshot(page)) });
    }
  }
}

await browser.close();

const late = samples.filter((s) => Number(s.label.replace("frac-", "")) >= 0.7);
const report = {
  premise:
    "After Request quote the remapped playhead must slide the model out and show the quote thread. --wf-handoff on the request panel must not stay 0.",
  url: targetUrl,
  viewport: { width, height },
  actors: {
    lateBare3d: late.some(
      (s) =>
        s.step === "handoff" &&
        !s.hubPresent &&
        (s.requestOpacity ?? 0) < 0.2 &&
        (s.modelOpacity ?? 1) > 0.8,
    ),
    lateChatVisible: late.some((s) => (s.requestOpacity ?? 0) > 0.6 && s.visibleRows > 0),
    handoffVarShadowed: samples.some(
      (s) => Number(s.outerHandoff) > 0.2 && Number(s.stageHandoff) === 0,
    ),
    selectGhost: samples.some(
      (s) => s.step === "select" && s.partPresent && (s.hubPresent || (s.introOpacity ?? 0) > 0.2),
    ),
    iosQuoteSteal: samples.some((s) => s.quoteBox?.pointerEvents === "auto"),
    iosRequestSteal: samples.some((s) => s.requestBox?.pointerEvents === "auto"),
    iosThreadScrollport: samples.some(
      (s) =>
        s.stageBox?.overflowY === "hidden" ||
        ["auto", "scroll", "hidden"].includes(s.quoteBox?.overflowY ?? ""),
    ),
    guideMiss: samples.some((s) => s.guideTarget && (s.guideOffset ?? 0) > 28),
  },
  samples,
};

const json = JSON.stringify(report, null, 2);
if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, json);
}
process.stdout.write(`${json}\n`);
