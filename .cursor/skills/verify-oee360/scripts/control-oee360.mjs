#!/usr/bin/env node
/**
 * Verification harness for OEE360 / Spares (Next.js).
 * Usage: node .cursor/skills/verify-oee360/scripts/control-oee360.mjs <command> ...
 */
import { spawn, spawnSync } from "node:child_process";
import {
  mkdir,
  readFile,
  writeFile,
  access,
  constants as fsConstants,
} from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../..");
const SKILL_ROOT = resolve(__dirname, "..");
const STATE_DIR = join(SKILL_ROOT, ".run-state");
const DEFAULT_PORT = 3010;

function usage(code = 1) {
  console.error(`Usage:
  control-oee360 launch [--port N]
  control-oee360 stop
  control-oee360 doctor [--base-url URL]
  control-oee360 api login --email E --password P [--base-url URL]
  control-oee360 api me [--base-url URL]
  control-oee360 api machines [--base-url URL]
  control-oee360 evidence-path
  control-oee360 browser screenshot --path FILE [--base-url URL]
  control-oee360 browser snapshot-aria --path FILE [--base-url URL]`);
  process.exit(code);
}

async function loadState() {
  try {
    const raw = await readFile(join(STATE_DIR, "state.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveState(state) {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(join(STATE_DIR, "state.json"), JSON.stringify(state, null, 2));
}

function runId() {
  return process.env.OEE360_VERIFY_RUN_ID || String(Date.now());
}

async function evidenceDir() {
  const id = runId();
  const dir = join(SKILL_ROOT, "evidence", id);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function cmdLaunch(args) {
  const port = Number(args.port ?? process.env.OEE360_VERIFY_PORT ?? DEFAULT_PORT);
  const id = runId();
  const dataDir = process.env.SPARES_DATA_DIR || `/tmp/oee360-verify-${id}`;
  await mkdir(dataDir, { recursive: true });

  const existing = await loadState();
  if (existing?.pid) {
    try {
      process.kill(existing.pid, 0);
      console.error(
        `Dev server already running (pid ${existing.pid}, port ${existing.port}). Run stop first.`,
      );
      process.exit(1);
    } catch {
      /* stale */
    }
  }

  const logPath = join(STATE_DIR, "dev.log");
  await mkdir(STATE_DIR, { recursive: true });
  const log = createWriteStream(logPath, { flags: "a" });
  const child = spawn("npm", ["run", "dev", "--", "-p", String(port)], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      SPARES_DATA_DIR: dataDir,
      PORT: String(port),
    },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.unref();

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 120_000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/login`, { redirect: "manual" });
      if (res.status === 200 || res.status === 307) {
        ready = true;
        break;
      }
    } catch {
      /* not up */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (!ready) {
    console.error(`Timed out waiting for ${baseUrl}/login (log: ${logPath})`);
    process.exit(1);
  }

  await saveState({
    runId: id,
    pid: child.pid,
    port,
    baseUrl,
    dataDir,
    cookieJar: join(STATE_DIR, "cookies.txt"),
  });
  console.log(JSON.stringify({ runId: id, baseUrl, dataDir, pid: child.pid }, null, 2));
}

async function cmdStop() {
  const state = await loadState();
  if (!state?.pid) {
    console.log("No tracked dev server.");
    return;
  }
  try {
    process.kill(-state.pid, "SIGTERM");
  } catch {
    try {
      process.kill(state.pid, "SIGTERM");
    } catch {
      /* gone */
    }
  }
  await saveState({ ...state, pid: null, stoppedAt: new Date().toISOString() });
  console.log(`Stopped pid ${state.pid} (port ${state.port}).`);
}

async function resolveBaseUrl(flagUrl) {
  if (flagUrl) return flagUrl.replace(/\/$/, "");
  const state = await loadState();
  if (state?.baseUrl) return state.baseUrl;
  return `http://127.0.0.1:${process.env.OEE360_VERIFY_PORT ?? DEFAULT_PORT}`;
}

async function cmdDoctor(baseUrl) {
  const url = await resolveBaseUrl(baseUrl);
  const checks = [];
  try {
    const login = await fetch(`${url}/login`);
    checks.push({ name: "GET /login", ok: login.status === 200, status: login.status });
  } catch (e) {
    checks.push({ name: "GET /login", ok: false, error: String(e) });
  }
  try {
    const me = await fetch(`${url}/api/auth/me`);
    checks.push({
      name: "GET /api/auth/me (anonymous)",
      ok: me.status === 401 || me.status === 200,
      status: me.status,
    });
  } catch (e) {
    checks.push({ name: "GET /api/auth/me", ok: false, error: String(e) });
  }
  const state = await loadState();
  const allOk = checks.every((c) => c.ok);
  console.log(
    JSON.stringify(
      {
        baseUrl: url,
        runState: state,
        checks,
        ok: allOk,
      },
      null,
      2,
    ),
  );
  process.exit(allOk ? 0 : 1);
}

async function cookieHeader() {
  const state = await loadState();
  if (!state?.cookieJar) return "";
  try {
    await access(state.cookieJar, fsConstants.R_OK);
    const raw = await readFile(state.cookieJar, "utf8");
    const lines = raw.split("\n").filter((l) => l && !l.startsWith("#"));
    const pairs = lines.map((line) => {
      const parts = line.split("\t");
      if (parts.length >= 7) return `${parts[5]}=${parts[6]}`;
      return null;
    });
    return pairs.filter(Boolean).join("; ");
  } catch {
    return "";
  }
}

async function cmdApiLogin(email, password, baseUrl) {
  const url = await resolveBaseUrl(baseUrl);
  const state = (await loadState()) || {};
  const jar = state.cookieJar || join(STATE_DIR, "cookies.txt");
  await mkdir(STATE_DIR, { recursive: true });

  const res = await fetch(`${url}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const setCookie =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie")]
        : [];
  const body = await res.text();
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    json = { raw: body };
  }

  if (res.ok && setCookie.length) {
    const netscape = [
      "# Netscape HTTP Cookie File",
      ...setCookie.map((c) => {
        const [pair] = c.split(";");
        const [name, ...rest] = pair.split("=");
        const value = rest.join("=");
        const host = new URL(url).hostname;
        return `${host}\tTRUE\t/\tFALSE\t0\t${name.trim()}\t${value.trim()}`;
      }),
    ].join("\n");
    await writeFile(jar, netscape);
    await saveState({ ...state, cookieJar: jar, baseUrl: url });
  }

  const out = { status: res.status, ok: res.ok, body: json };
  console.log(JSON.stringify(out, null, 2));
  process.exit(res.ok ? 0 : 1);
}

async function cmdApiMe(baseUrl) {
  const url = await resolveBaseUrl(baseUrl);
  const cookie = await cookieHeader();
  const res = await fetch(`${url}/api/auth/me`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  const body = await res.json().catch(() => ({}));
  console.log(JSON.stringify({ status: res.status, body }, null, 2));
  process.exit(res.ok ? 0 : 1);
}

async function cmdApiMachines(baseUrl) {
  const url = await resolveBaseUrl(baseUrl);
  const cookie = await cookieHeader();
  const res = await fetch(`${url}/api/machines`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  const body = await res.json().catch(() => ({}));
  console.log(JSON.stringify({ status: res.status, body }, null, 2));
  process.exit(res.ok ? 0 : 1);
}

async function cmdBrowserScreenshot(outPath, baseUrl) {
  const url = await resolveBaseUrl(baseUrl);
  const cookie = await cookieHeader();
  const absOut = resolve(outPath);
  await mkdir(dirname(absOut), { recursive: true });

  const script = `
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const cookies = ${JSON.stringify(cookie)};
  if (cookies) {
    const pairs = cookies.split(';').map(s => s.trim()).filter(Boolean);
    await context.addCookies(pairs.map(p => {
      const i = p.indexOf('=');
      const name = p.slice(0, i);
      const value = p.slice(i + 1);
      return { name, value, domain: '127.0.0.1', path: '/' };
    }));
  }
  const page = await context.newPage();
  await page.goto(${JSON.stringify(`${url}/machines`)}, { waitUntil: 'networkidle' });
  await page.screenshot({ path: ${JSON.stringify(absOut)}, fullPage: true });
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
`;
  const harnessDir = join(__dirname);
  spawnSync("npm", ["install", "--omit=dev"], {
    cwd: harnessDir,
    stdio: "ignore",
  });
  spawnSync("npx", ["playwright", "install", "chromium"], {
    cwd: harnessDir,
    stdio: "inherit",
  });
  const tmp = join(harnessDir, "browser-shot.cjs");
  await writeFile(tmp, script);
  const run = spawnSync("node", [tmp], {
    cwd: harnessDir,
    stdio: "inherit",
  });
  process.exit(run.status ?? 1);
}

async function cmdBrowserAria(outPath, baseUrl) {
  const url = await resolveBaseUrl(baseUrl);
  const absOut = resolve(outPath);
  await mkdir(dirname(absOut), { recursive: true });
  const script = `
const fs = require('fs/promises');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  await page.goto(${JSON.stringify(`${url}/login`)}, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const snap = await page.locator('body').ariaSnapshot();
  await fs.writeFile(${JSON.stringify(absOut)}, snap);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
`;
  const harnessDir = join(__dirname);
  spawnSync("npm", ["install", "--omit=dev"], {
    cwd: harnessDir,
    stdio: "ignore",
  });
  spawnSync("npx", ["playwright", "install", "chromium"], {
    cwd: harnessDir,
    stdio: "inherit",
  });
  const tmp = join(harnessDir, "browser-aria.cjs");
  await writeFile(tmp, script);
  const run = spawnSync("node", [tmp], {
    cwd: harnessDir,
    stdio: "inherit",
  });
  process.exit(run.status ?? 1);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) usage();

  const readFlag = (name) => {
    const i = argv.indexOf(name);
    if (i === -1) return undefined;
    return argv[i + 1];
  };

  const cmd = argv[0];
  if (cmd === "launch") {
    await cmdLaunch({ port: readFlag("--port") });
    return;
  }
  if (cmd === "stop") {
    await cmdStop();
    return;
  }
  if (cmd === "doctor") {
    await cmdDoctor(readFlag("--base-url"));
    return;
  }
  if (cmd === "evidence-path") {
    console.log(await evidenceDir());
    return;
  }
  if (cmd === "api") {
    const sub = argv[1];
    if (sub === "login") {
      await cmdApiLogin(
        readFlag("--email"),
        readFlag("--password"),
        readFlag("--base-url"),
      );
      return;
    }
    if (sub === "me") {
      await cmdApiMe(readFlag("--base-url"));
      return;
    }
    if (sub === "machines") {
      await cmdApiMachines(readFlag("--base-url"));
      return;
    }
  }
  if (cmd === "browser") {
    const sub = argv[1];
    if (sub === "screenshot") {
      await cmdBrowserScreenshot(readFlag("--path"), readFlag("--base-url"));
      return;
    }
    if (sub === "snapshot-aria") {
      await cmdBrowserAria(readFlag("--path"), readFlag("--base-url"));
      return;
    }
  }
  usage();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
