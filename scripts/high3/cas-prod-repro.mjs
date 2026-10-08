/* Blob/db.json CAS repro against a production build (`next build` + `next start`).
 *
 * Usage: node --experimental-strip-types scripts/high3/cas-prod-repro.mjs <out.json> [portA] [portB]
 * Run from a built checkout. Starts TWO `next start` servers on ONE data dir (two
 * "serverless instances"), on a live-like catalog: demo buyer present, marker set, hardware
 * fixture + lifecycle + buyer grant missing. Both instances heal at once while the buyer
 * opens tickets through both. Passwords are generated per run.
 *
 * Expected after the fix: every ticket is in db.json AND care.json, and the buyer grant,
 * hardware machine and lifecycle rows are durable. Before the fix the instances overwrite
 * each other (tickets and/or the heal result are lost).
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { hashPassword } from "../../src/lib/auth/password.ts";

const OUT = process.argv[2] ?? "cas-prod-repro.json";
const PORT_A = Number(process.argv[3] ?? 3951);
const PORT_B = Number(process.argv[4] ?? 3952);
const TICKETS_PER_SERVER = 10;
const HOST_TENANT = "tenant-oee360-host";
const BUYER = "user@demo.com";
const HW = "hardware-fixture";
const password = randomBytes(18).toString("base64url");
const authSecret = randomBytes(32).toString("hex");
const dataDir = await mkdtemp(path.join(tmpdir(), "spares-cas-prod-"));
await mkdir(path.join(dataDir, "files"), { recursive: true });
const baseUrl = (port) => `http://localhost:${port}`;

function startServer(port) {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      SPARES_ALLOW_SEED: "false",
      SPARES_DATA_DIR: dataDir,
      AUTH_SECRET: authSecret,
      SPARES_PUBLIC_ORIGIN: baseUrl(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  return { child, port, log: () => log };
}

async function waitUp(port) {
  for (let i = 0; i < 80; i++) {
    try {
      await fetch(`${baseUrl(port)}/login`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`server ${port} did not start`);
}

const stop = async (server) => {
  server.child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 800));
};

const post = (port, url, body, cookie) =>
  fetch(baseUrl(port) + url, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl(port), ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

// First boot creates db.json (empty catalog); then rewrite it into the live-like state.
let boot = startServer(PORT_A);
await waitUp(PORT_A);
await post(PORT_A, "/api/auth/login", { email: "nobody@example.com", password: "x" });
await stop(boot);

const dbFile = path.join(dataDir, "db.json");
const db = JSON.parse(await readFile(dbFile, "utf8"));
db.users.push({
  id: "repro-demo-buyer",
  email: BUYER,
  passwordHash: await hashPassword(password),
  role: "customer",
  tenantId: HOST_TENANT,
  siteIds: ["site-cargill-ftw", "site-cargill-wichita"],
  machineIds: [],
  name: "Demo buyer",
  sessionStamp: 0,
});
db.machines = db.machines.filter((m) => m.id !== HW);
db.partLifecycle = [];
db.dataMigrations = { demoTenantV1: 1 };
await writeFile(dbFile, JSON.stringify(db, null, 2));
const hashBefore = db.users.find((u) => u.email === BUYER).passwordHash;

const servers = [startServer(PORT_A), startServer(PORT_B)];
await Promise.all(servers.map((s) => waitUp(s.port)));

// Both instances heal at the same moment.
const logins = await Promise.all(servers.map((s) => post(s.port, "/api/auth/login", { email: BUYER, password })));
const cookies = logins.map((r) => (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; "));

const ticketPosts = [];
for (let i = 0; i < TICKETS_PER_SERVER; i++) {
  servers.forEach((server, index) => {
    ticketPosts.push(
      post(server.port, `/api/machines/${HW}/tickets`, { title: `s${index}-ticket-${i}` }, cookies[index]).then(
        (r) => r.status,
      ),
    );
  });
}
const statuses = await Promise.all(ticketPosts);

const disk = JSON.parse(await readFile(dbFile, "utf8"));
const care = JSON.parse(await readFile(path.join(dataDir, "care.json"), "utf8"));
const expected = [];
for (let s = 0; s < 2; s++) for (let i = 0; i < TICKETS_PER_SERVER; i++) expected.push(`s${s}-ticket-${i}`);
const inDb = new Set((disk.tickets ?? []).map((t) => t.title));
const inCare = new Set((care.tickets ?? []).map((t) => t.title));
const buyer = disk.users.find((u) => u.email === BUYER);
const results = {
  loginStatuses: logins.map((r) => r.status),
  ticketPostStatuses: statuses,
  expectedTickets: expected.length,
  ticketsInDbJson: expected.filter((t) => inDb.has(t)).length,
  ticketsInCareJson: expected.filter((t) => inCare.has(t)).length,
  missingFromDbJson: expected.filter((t) => !inDb.has(t)),
  missingFromCareJson: expected.filter((t) => !inCare.has(t)),
  onDisk: {
    marker: disk.dataMigrations,
    hardwareMachine: disk.machines.some((m) => m.id === HW),
    lifecycleRows: (disk.partLifecycle ?? []).length,
    buyerMachineIds: buyer?.machineIds,
    passwordHashUnchanged: buyer?.passwordHash === hashBefore,
    sessionStamp: buyer?.sessionStamp,
  },
};
await Promise.all(servers.map(stop));
await writeFile(OUT, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
const ok =
  results.ticketsInDbJson === results.expectedTickets &&
  results.ticketsInCareJson === results.expectedTickets &&
  results.onDisk.hardwareMachine &&
  results.onDisk.buyerMachineIds?.includes(HW) &&
  results.onDisk.passwordHashUnchanged;
console.log(ok ? "RESULT: no lost writes" : "RESULT: LOST WRITES (regression reproduced)");
process.exit(0);
