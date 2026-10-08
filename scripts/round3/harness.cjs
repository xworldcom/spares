/* eslint-disable @typescript-eslint/no-require-imports */
/* Shared Playwright harness for Round 3 prod-build proofs (uses verify-oee360 playwright). */
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require(
  path.join(__dirname, "../../.cursor/skills/verify-oee360/scripts/node_modules/playwright"),
);

const BASE = process.env.R3_BASE ?? "http://localhost:3013";
const TAG = process.env.R3_TAG ?? "after";
const OUT = process.env.R3_OUT ?? "/cursor/stores/self/media/round3";
const CUSTOMER = { email: "customer@spares.local", password: "SparesCustomer1!" };

fs.mkdirSync(OUT, { recursive: true });

async function launch({ viewport = { width: 1440, height: 900 }, name, video = true, mobile = false } = {}) {
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
    ...(video ? { recordVideo: { dir: videoDir, size: viewport } } : {}),
  });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  return { browser, context, page, videoDir };
}

async function apiLogin(context, creds = CUSTOMER) {
  const res = await context.request.post(BASE + "/api/auth/login", { data: creds });
  if (!res.ok()) throw new Error("login failed " + res.status());
}

async function seedTicket(context, machineId, title, note, replies = []) {
  const created = await context.request.post(`${BASE}/api/machines/${machineId}/tickets`, { data: { title, note } });
  if (!created.ok()) throw new Error("ticket create failed " + created.status());
  const body = await created.json();
  const ticket = body.ticket;
  for (const text of replies) {
    const r = await context.request.post(`${BASE}/api/tickets/${ticket.id}/activity`, { data: { text } });
    if (!r.ok()) throw new Error("reply failed " + r.status());
  }
  return ticket;
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

async function finish({ browser, context, page, videoDir }, name) {
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

const results = [];
function check(label, ok, detail = "") {
  results.push({ label, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? " — " + detail : ""}`);
}

function writeProof(name, extra = {}) {
  fs.writeFileSync(
    path.join(OUT, `${TAG}-${name}-proof.json`),
    JSON.stringify({ base: BASE, tag: TAG, results, ...extra }, null, 2),
  );
  const failed = results.filter((r) => !r.ok);
  if (failed.length) process.exitCode = 1;
}

module.exports = { seedTicket, BASE, TAG, OUT, CUSTOMER, launch, apiLogin, uiLogin, finish, check, writeProof };
