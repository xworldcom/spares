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

const targetUrl = arg("url", "http://localhost:3010/");
const width = Number(arg("width", "390"));
const height = Number(arg("height", "844"));
const outPath = arg("out", "");

spawnSync("npm", ["install", "--omit=dev"], { cwd: harness, stdio: "ignore" });
const engine = arg("browser", "chromium");
spawnSync("npx", ["playwright", "install", engine], { cwd: harness, stdio: "inherit" });

const require = createRequire(join(harness, "package.json"));
const { chromium, webkit } = require("playwright");

async function snapshot(page) {
  return page.evaluate(() => {
    const overflowChain = (el) => {
      const chain = [];
      let node = el;
      while (node) {
        const style = getComputedStyle(node);
        const ox = style.overflowX;
        const oy = style.overflowY;
        if (ox !== "visible" || oy !== "visible") {
          chain.push({
            tag: node.tagName.toLowerCase(),
            className: typeof node.className === "string" ? node.className : "",
            overflowX: ox,
            overflowY: oy,
            position: style.position,
            height: Math.round(node.getBoundingClientRect().height),
          });
        }
        node = node.parentElement;
      }
      return chain;
    };
    const section = document.querySelector(".landing-demo-scrub");
    const pin = document.querySelector(".landing-demo-scrub-pin");
    const tree = document.querySelector(".landing-demo-tree");
    const hero = document.querySelector(".landing-hero");
    const peek = document.querySelector(".landing-scroll-peek");
    const thread = document.querySelector(".landing-demo-thread");
    const rows = [...document.querySelectorAll("[data-demo='quote'] .imsg-row, [data-demo='quote'] .imsg-system")];
    const strip = document.querySelector("[data-demo='quote'] .quote-progress-step[aria-current='step'] .quote-progress-label-full");
    if (!section || !pin) {
      return { missing: true };
    }
    const sectionBox = section.getBoundingClientRect();
    const pinBox = pin.getBoundingClientRect();
    const pinStyle = getComputedStyle(pin);
    const stickyTop = Number.parseFloat(pinStyle.top) || 0;
    const scrollable = section.offsetHeight - pin.offsetHeight;
    const raw = scrollable <= 0 ? null : (stickyTop - sectionBox.top) / scrollable;
    let sectionDocumentTop = 0;
    let node = section;
    while (node) {
      sectionDocumentTop += node.offsetTop;
      node = node.offsetParent instanceof HTMLElement ? node.offsetParent : null;
    }
    const pageY = Math.max(
      window.pageYOffset || 0,
      document.documentElement.scrollTop || 0,
      document.body?.scrollTop || 0,
      document.scrollingElement?.scrollTop || 0,
    );
    const documentRaw =
      scrollable <= 0 ? null : (pageY + stickyTop - sectionDocumentTop) / scrollable;
    const transforms = [];
    let ancestor = pin.parentElement;
    while (ancestor) {
      const style = getComputedStyle(ancestor);
      if (style.transform !== "none" || style.filter !== "none" || style.perspective !== "none") {
        transforms.push({
          tag: ancestor.tagName.toLowerCase(),
          className: typeof ancestor.className === "string" ? ancestor.className : "",
          transform: style.transform,
          filter: style.filter,
          perspective: style.perspective,
        });
      }
      ancestor = ancestor.parentElement;
    }
    return {
      missing: false,
      href: location.href,
      heroIn: Boolean(hero?.classList.contains("is-in")),
      peekLabel: peek?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      scrollingElement: document.scrollingElement?.tagName ?? null,
      scrollY: Math.round(window.scrollY),
      pageY: Math.round(pageY),
      documentElementScrollTop: Math.round(document.documentElement.scrollTop || 0),
      bodyScrollTop: Math.round(document.body?.scrollTop || 0),
      sectionDocumentTop: Math.round(sectionDocumentTop),
      rectProgress: raw,
      documentProgress: documentRaw,
      transformAncestors: transforms,
      innerHeight: window.innerHeight,
      visualViewport: window.visualViewport
        ? {
            height: Math.round(window.visualViewport.height),
            offsetTop: window.visualViewport.offsetTop,
          }
        : null,
      progressAttr: section.getAttribute("data-progress"),
      extra: section.style.getPropertyValue("--landing-demo-scrub-extra") || null,
      reduceMotion: section.hasAttribute("data-reduce-motion"),
      sectionHeight: section.offsetHeight,
      pinHeight: pin.offsetHeight,
      pinTop: Math.round(pinBox.top),
      sectionTop: Math.round(sectionBox.top),
      stickyTop,
      pinPosition: pinStyle.position,
      pinCssHeight: pinStyle.height,
      scrollable,
      rawProgress: raw,
      treeDisplay: tree ? getComputedStyle(tree).display : null,
      treeHeight: tree ? Math.round(tree.getBoundingClientRect().height) : 0,
      threadOverflowY: thread ? getComputedStyle(thread).overflowY : null,
      quoteRows: rows.length,
      quoteCurrent: strip?.textContent?.trim() ?? null,
      scrollTimeline: CSS.supports("animation-timeline: scroll()"),
      viewTimeline: CSS.supports("animation-timeline: view()"),
      overflowAncestors: overflowChain(pin),
    };
  });
}

const engines = { chromium, webkit };
const launcher = engines[engine];
if (!launcher) {
  throw new Error(`unknown --browser ${engine}`);
}

const browser = await launcher.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width, height },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
});
const page = await context.newPage();
await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(1200);

const samples = [];
samples.push({ label: "load", ...(await snapshot(page)) });

const story = page.locator("#product-story");
if (await story.count()) {
  await story.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(200);
  samples.push({ label: "story-start", ...(await snapshot(page)) });
}

const section = page.locator(".landing-demo-scrub").first();
if (await section.count()) {
  const box = await section.boundingBox();
  if (box) {
    const start = box.y + (await page.evaluate(() => window.scrollY));
    const track = box.height;
    for (const frac of [0.15, 0.35, 0.55, 0.75, 0.95]) {
      await page.evaluate((y) => window.scrollTo(0, y), start + track * frac);
      await page.waitForTimeout(120);
      samples.push({ label: `track-${frac}`, ...(await snapshot(page)) });
    }
    await page.evaluate((y) => window.scrollTo(0, y), start + track * 0.15);
    await page.waitForTimeout(120);
    samples.push({ label: "rewind-0.15", ...(await snapshot(page)) });
  }
}

await browser.close();

const progressValues = samples
  .map((s) => Number.parseFloat(s.progressAttr ?? "0"))
  .filter((n) => Number.isFinite(n));
const pinTops = samples.filter((s) => s.label === "track-0.15" || s.label === "track-0.35" || s.label === "track-0.55");
const uniqueProgress = [...new Set(progressValues.map((n) => n.toFixed(3)))];
const pinStuck =
  pinTops.length >= 3 &&
  pinTops.every((s) => typeof s.pinTop === "number" && Math.abs(s.pinTop - (s.stickyTop || 56)) < 8);

const report = {
  premise:
    "Document scrollY plus offsetTop, not a live client rect, is the playhead on iPhone Safari.",
  url: targetUrl,
  engine,
  viewport: { width, height },
  actors: {
    hydration: samples[0]?.heroIn ?? false,
    playheadMoves: uniqueProgress.length > 2,
    uniqueProgress,
    stickyPins: pinStuck,
    scrollablePositive: (samples.find((s) => s.label === "story-start")?.scrollable ?? 0) > 0,
    treeHidden: samples[0]?.treeDisplay === "none" || samples[0]?.treeHeight === 0,
    scrollDrivenSupported: Boolean(samples[0]?.scrollTimeline || samples[0]?.viewTimeline),
    overflowClipAncestors: (samples[0]?.overflowAncestors ?? []).filter(
      (node) => node.overflowX === "clip" || node.overflowY === "clip" || node.overflowX === "hidden",
    ),
  },
  samples,
};

const json = JSON.stringify(report, null, 2);
if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, json);
}
process.stdout.write(`${json}\n`);
