#!/usr/bin/env node
/**
 * Single-session minimal SEQ: staff + customer sign-in, Quotes / Tickets / Care (+ bugs/notifications APIs).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/bc-7479d24f-d92e-51f0-ab53-0ec629d66015/media/staff-app/par4-backlog-batch-2026-10-11",
);
mkdirSync(outDir, { recursive: true });

const accounts = [
  { role: "staff", email: "staff@demo.com", password: "demo123456" },
  { role: "customer", email: "user@demo.com", password: "demo123456" },
];

async function login(email, password) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const jar = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
  return { ok: res.ok, status: res.status, jar };
}

async function get(jar, path, headers = {}) {
  const started = performance.now();
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { cookie: jar, ...headers },
  });
  const ms = Math.round(performance.now() - started);
  const etag = res.headers.get("etag");
  let keys = null;
  if (res.status !== 304) {
    try {
      const body = await res.json();
      keys = body && typeof body === "object" ? Object.keys(body) : null;
    } catch {
      keys = null;
    }
  }
  return { path, status: res.status, ms, etag, keys };
}

const transcript = { baseUrl, at: new Date().toISOString(), accounts: [] };

for (const account of accounts) {
  const loginResult = await login(account.email, account.password);
  const steps = [{ step: "login", ...loginResult }];
  if (!loginResult.ok) {
    transcript.accounts.push({ ...account, steps, ok: false });
    continue;
  }
  const jar = loginResult.jar;
  const paths =
    account.role === "staff"
      ? [
          "/api/quotes",
          "/api/staff/tickets",
          "/api/bugs",
          "/api/staff/part-lifecycle",
          "/api/notifications/lifecycle",
        ]
      : ["/api/quotes", "/api/tickets", "/api/notifications/lifecycle"];
  for (const path of paths) {
    const first = await get(jar, path);
    steps.push({ step: "GET", ...first, inm: null });
    if (first.etag) {
      const second = await get(jar, path, { "if-none-match": first.etag });
      steps.push({ step: "GET+INM", ...second, inm: first.etag });
      if (path === "/api/staff/part-lifecycle" && second.status !== 304) {
        steps.push({
          step: "assert",
          path,
          ok: false,
          error: `expected 304 on INM replay, got ${second.status}`,
        });
      }
    }
  }
  transcript.accounts.push({
    ...account,
    steps,
    ok: steps.every((s) => s.ok !== false && (s.status === 200 || s.status === 304)),
  });
}

transcript.ok = transcript.accounts.every((a) => a.ok);
writeFileSync(resolve(outDir, "seq-minimal-api.json"), JSON.stringify(transcript, null, 2));
console.log(JSON.stringify({ ok: transcript.ok, outDir }, null, 2));
process.exit(transcript.ok ? 0 : 1);
