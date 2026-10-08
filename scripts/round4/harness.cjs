/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");
const fs = require("node:fs");
function loadPlaywright() {
  const candidates = [
    path.join(__dirname, "../../node_modules/playwright"),
    path.join(__dirname, "../../.cursor/skills/verify-oee360/scripts/node_modules/playwright"),
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      continue;
    }
  }
  throw new Error("playwright not installed (npm install playwright)");
}

const { chromium } = loadPlaywright();

const BASE = process.env.R4_BASE ?? "http://localhost:3014";
const TAG = process.env.R4_TAG ?? "after";
const OUT = process.env.R4_OUT ?? "/cursor/stores/self/media/round4";
const CUSTOMER = { email: "customer@spares.local", password: "SparesCustomer1!" };

fs.mkdirSync(OUT, { recursive: true });

async function launch({ viewport = { width: 1440, height: 900 }, name, mobile = false } = {}) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN ?? "/usr/local/bin/google-chrome",
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"],
  });
  const videoDir = path.join(OUT, "_video-" + name);
  const context = await browser.newContext({
    viewport,
    hasTouch: mobile,
    isMobile: mobile,
    deviceScaleFactor: mobile ? 2 : 1,
    recordVideo: { dir: videoDir, size: viewport },
  });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  return { browser, context, page, videoDir, name };
}

async function apiLogin(context, creds = CUSTOMER) {
  const res = await context.request.post(BASE + "/api/auth/login", { data: creds });
  if (!res.ok()) throw new Error("login failed " + res.status());
}

async function uiLogin(page, creds = CUSTOMER, next = "/machines") {
  await page.goto(BASE + "/login?next=" + encodeURIComponent(next), { waitUntil: "networkidle" });
  const submit = page.getByRole("button", { name: "Sign in" });
  await submit.waitFor({ state: "visible" });
  await page.waitForFunction(
    () => {
      const button = document.querySelector(".login-submit");
      return button && !button.disabled && button.getAttribute("aria-disabled") !== "true";
    },
    { timeout: 15000 },
  );
  await page.fill("#email", creds.email);
  await page.fill("#password", creds.password);
  await submit.click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
}

async function finish(run) {
  const { browser, context, page, videoDir, name } = run;
  await context.tracing.stop({ path: path.join(OUT, `${TAG}-${name}-trace.zip`) });
  const video = page.video();
  await context.close();
  if (video) {
    const dest = path.join(OUT, `${TAG}-${name}.webm`);
    await video.saveAs(dest).catch(() => undefined);
    fs.rmSync(videoDir, { recursive: true, force: true });
  }
  await browser.close();
}

const checks = [];
function check(label, ok, detail = "") {
  checks.push({ label, ok, detail });
  console.log(ok ? "PASS" : "FAIL", label, detail);
}

module.exports = {
  BASE,
  TAG,
  OUT,
  CUSTOMER,
  launch,
  apiLogin,
  uiLogin,
  finish,
  check,
  checks,
  path,
  fs,
};
