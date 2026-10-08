/* HIGH 3 live-regression repro against a production build (`next build` + `next start`).
 *
 * Usage: node --experimental-strip-types scripts/high3/prod-repro.mjs <out.json> [port]
 * Run from a checkout that has been built. Builds the loss scenario from the live symptom:
 * catalog already carries dataMigrations.demoTenantV1=1 but the hardware fixture, its
 * lifecycle rows, and the buyer's grant are missing. Passwords are generated per run.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { hashPassword } from "../../src/lib/auth/password.ts";

const OUT = process.argv[2] ?? "high3-prod-repro.json";
const PORT = Number(process.argv[3] ?? 3939);
const HOST_TENANT = "tenant-oee360-host";
const BUYER = "user@demo.com";
const HW = "hardware-fixture";
const password = randomBytes(18).toString("base64url");
const dataDir = await mkdtemp(path.join(tmpdir(), "spares-high3-prod-"));
await mkdir(path.join(dataDir, "files"), { recursive: true });
const base = `http://localhost:${PORT}`;

function startServer() {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      SPARES_ALLOW_SEED: "false",
      SPARES_DATA_DIR: dataDir,
      AUTH_SECRET: randomBytes(32).toString("hex"),
      SPARES_PUBLIC_ORIGIN: base,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  return { child, log: () => log };
}

async function waitUp() {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`${base}/login`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("server did not start");
}

async function stop(server) {
  server.child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 800));
}

const post = (url, body, cookie) =>
  fetch(base + url, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

let server = startServer();
await waitUp();
await post("/api/auth/login", { email: "nobody@example.com", password: "x" });
await stop(server);

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

server = startServer();
await waitUp();
const login = await post("/api/auth/login", { email: BUYER, password });
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
const results = { loginStatus: login.status, hardwareFixture: [], machines: null, me: null };
for (let i = 0; i < 8; i++) {
  const res = await fetch(`${base}/api/machines/${HW}`, { headers: { cookie } });
  results.hardwareFixture.push(res.status);
}
const machines = await (await fetch(`${base}/api/machines`, { headers: { cookie } })).json();
results.machines = (Array.isArray(machines) ? machines : machines.machines ?? []).map((m) => m.id);
const me = await (await fetch(`${base}/api/auth/me`, { headers: { cookie } })).json();
results.me = { machineIds: me.user?.machineIds ?? me.machineIds, tenantId: me.user?.tenantId ?? me.tenantId };
const disk = JSON.parse(await readFile(dbFile, "utf8"));
const buyer = disk.users.find((u) => u.email === BUYER);
results.onDisk = {
  marker: disk.dataMigrations,
  hardwareMachine: disk.machines.some((m) => m.id === HW),
  lifecycleRows: (disk.partLifecycle ?? []).length,
  buyerMachineIds: buyer?.machineIds,
  passwordHashUnchanged: Boolean(buyer?.passwordHash?.length),
};
await stop(server);
await writeFile(OUT, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
const ok = results.hardwareFixture.every((s) => s === 200);
console.log(ok ? "RESULT: hardware-fixture 200 x8" : "RESULT: hardware-fixture NOT 200 (regression reproduced)");
process.exit(0);
