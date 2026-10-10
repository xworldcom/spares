#!/usr/bin/env node
/**
 * Cold-cache stills for hydration #345 parity gate.
 * Usage: node hydration-345-parity-capture.mjs <baseUrl> <outDir> <labelPrefix>
 */
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { chromium, devices } from "playwright";

const baseUrl = (process.argv[2] || "http://127.0.0.1:3020").replace(/\/$/, "");
const outDir = process.argv[3] || "/tmp/hydration-parity";
const label = process.argv[4] || "build";

async function disableCache(page) {
  const client = await page.context().newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.setCacheDisabled", { cacheDisabled: true });
}

async function hardGoto(page, url) {
  await disableCache(page);
  await page.goto(url, { waitUntil: "load", timeout: 120_000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function shot(page, file) {
  await page.screenshot({ path: file, fullPage: false });
  console.log("wrote", file);
}

async function freezeMotion(page) {
  await page.evaluate(() => {
    for (const video of document.querySelectorAll("video")) {
      video.pause();
      try {
        video.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function captureLanding(browser, viewport, name) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await hardGoto(page, `${baseUrl}/`);
  await freezeMotion(page);
  await shot(page, join(outDir, `${label}-landing-${name}.png`));
  await context.close();
}

function curlApi(method, path, jar, body) {
  const args = [
    "-s",
    "-b",
    jar,
    "-c",
    jar,
    "-X",
    method,
    `${baseUrl}${path}`,
    "-H",
    "content-type: application/json",
  ];
  if (body !== undefined) {
    args.push("-d", JSON.stringify(body));
  }
  const result = spawnSync("curl", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`curl ${method} ${path}: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

async function captureCareNotesPhone(browser) {
  const jarDir = await mkdtemp(join(tmpdir(), "oee360-parity-"));
  const jar = join(jarDir, "cookies.txt");
  curlApi("POST", "/api/auth/login", jar, {
    email: "staff@spares.local",
    password: "SparesStaff1!",
  });
  const createdRaw = curlApi("POST", "/api/machines/palletizer/tickets", jar, {
    title: "Parity gate",
    note: "cold load check",
  });
  const ticket = JSON.parse(createdRaw).ticket;
  curlApi("PATCH", `/api/tickets/${ticket.id}/assistant`, jar, { paused: true });

  const context = await browser.newContext({
    ...devices["iPhone 13"],
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const jarText = await import("node:fs").then((fs) => fs.promises.readFile(jar, "utf8"));
  const cookies = [];
  for (const line of jarText.split("\n")) {
    if (!line.trim() || (line.startsWith("#") && !line.startsWith("#HttpOnly_"))) {
      continue;
    }
    const [domainField, , path, secure, , name, value] = line.split("\t");
    if (!name || value === undefined) continue;
    const httpOnly = domainField.startsWith("#HttpOnly_");
    const domain = domainField.replace(/^#HttpOnly_/, "").replace(/^\./, "");
    cookies.push({
      name,
      value,
      domain,
      path: path || "/",
      secure: false,
      httpOnly,
      sameSite: "Lax",
    });
  }
  if (cookies.length) {
    await context.addCookies(cookies);
  }
  await hardGoto(
    page,
    `${baseUrl}/machines/palletizer/care/tickets/${ticket.id}`,
  );
  await page
    .locator("[data-conversation-sheet]")
    .first()
    .waitFor({ state: "visible", timeout: 60_000 });
  await freezeMotion(page);
  await shot(page, join(outDir, `${label}-care-notes-390.png`));
  await context.close();
  await rm(jarDir, { recursive: true, force: true });
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  await captureLanding(browser, { width: 1440, height: 900 }, "1440");
  await captureLanding(browser, { width: 390, height: 844 }, "390");
  await captureCareNotesPhone(browser);
} finally {
  await browser.close();
}
