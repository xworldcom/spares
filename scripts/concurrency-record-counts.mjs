#!/usr/bin/env node
/**
 * Extended API-derived record counts for merge gate.
 */
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
} from "node:fs";
import { resolve } from "node:path";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    "/cursor/stores/self/media/staff-app/concurrency-migration",
);
mkdirSync(outDir, { recursive: true });
const label = process.env.OEE360_COUNT_LABEL || "counts";

async function login(email, password) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const jar = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
  return { ok: res.ok, jar };
}

function sumQuoteLines(quotes) {
  return (quotes ?? []).reduce((n, q) => n + (q.items?.length ?? 0), 0);
}

function sumTicketActivities(tickets) {
  return (tickets ?? []).reduce((n, t) => n + (t.activities?.length ?? 0), 0);
}

function loadBaseline() {
  const pre = joinPath(outDir, "counts-pre-merge-378.json");
  if (!existsSync(pre)) {
    return null;
  }
  return JSON.parse(readFileSync(pre, "utf8"));
}

function countsFromBlobBackup() {
  const backupRoot = joinPath(outDir, "backups");
  if (!existsSync(backupRoot)) {
    return null;
  }
  const stamps = readdirSync(backupRoot).filter((name) => {
    const dbPath = joinPath(backupRoot, name, "database.json");
    return existsSync(dbPath) && statSync(dbPath).isFile();
  });
  if (!stamps.length) {
    return null;
  }
  stamps.sort();
  const stamp = stamps[stamps.length - 1];
  const stampDir = joinPath(backupRoot, stamp);
  const readJsonFile = (name) => {
    const filePath = joinPath(stampDir, name);
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      return null;
    }
    return JSON.parse(readFileSync(filePath, "utf8"));
  };
  const db = readJsonFile("database.json");
  const care = readJsonFile("care.json");
  if (!db || !care) {
    return null;
  }
  const activity = readJsonFile("activity.json");
  const quotes = db.quotes ?? [];
  const tickets = care.tickets ?? [];
  const users = db.users ?? [];
  return {
    stamp,
    quoteLines: quotes.reduce((n, q) => n + (q.items?.length ?? 0), 0),
    ticketActivities: tickets.reduce((n, t) => n + (t.activities?.length ?? 0), 0),
    users: users.length,
    activityEvents: activity?.events?.length ?? 0,
    entityShardFiles: existsSync(joinPath(stampDir, "entity-shards"))
      ? readdirSync(joinPath(stampDir, "entity-shards")).filter((f) =>
          statSync(joinPath(stampDir, "entity-shards", f)).isFile(),
        ).length
      : 0,
  };
}

function joinPath(...parts) {
  return resolve(...parts);
}

function diffCounts(baseline, current) {
  if (!baseline?.counts) {
    return { note: "no baseline" };
  }
  const drift = {};
  for (const key of Object.keys(current)) {
    if (baseline.counts[key] !== undefined && baseline.counts[key] !== current[key]) {
      drift[key] = { before: baseline.counts[key], after: current[key] };
    }
  }
  return Object.keys(drift).length ? drift : null;
}

async function main() {
  const staff = await login("staff@demo.com", "demo123456");
  const customer = await login("user@demo.com", "demo123456");
  const result = {
    baseUrl,
    at: new Date().toISOString(),
    label,
    staffOk: staff.ok,
    customerOk: customer.ok,
    counts: {},
    driftVsPreMerge378: null,
  };
  if (!staff.ok) {
    writeFileSync(`${outDir}/${label}.json`, JSON.stringify(result, null, 2));
    process.exit(1);
  }
  const [quotes, tickets, lifecycle, directory, notif] = await Promise.all([
    fetch(`${baseUrl}/api/quotes`, { headers: { cookie: staff.jar } }).then((r) => r.json()),
    fetch(`${baseUrl}/api/tickets`, { headers: { cookie: staff.jar } }).then((r) => r.json()),
    fetch(`${baseUrl}/api/staff/part-lifecycle`, { headers: { cookie: staff.jar } }).then((r) =>
      r.json(),
    ),
    fetch(`${baseUrl}/api/platform/directory`, { headers: { cookie: staff.jar } }).then((r) =>
      r.json(),
    ),
    fetch(`${baseUrl}/api/notifications/lifecycle`, { headers: { cookie: staff.jar } }).then((r) =>
      r.json(),
    ),
  ]);
  result.counts = {
    quotes: quotes.quotes?.length ?? 0,
    quoteLines: sumQuoteLines(quotes.quotes),
    tickets: tickets.tickets?.length ?? 0,
    ticketActivities: sumTicketActivities(tickets.tickets),
    lifecycleParts: lifecycle.parts?.length ?? 0,
    unreadQuotes: quotes.unreadCount ?? 0,
    directoryUsers:
      directory.users?.length ??
      directory.customers?.length ??
      (directory.tenants?.reduce((n, t) => n + (t.users?.length ?? 0), 0) ?? 0),
    lifecycleNotifications: notif.notifications?.length ?? 0,
  };
  if (customer.ok) {
    const [cq, cm] = await Promise.all([
      fetch(`${baseUrl}/api/quotes`, { headers: { cookie: customer.jar } }).then((r) => r.json()),
      fetch(`${baseUrl}/api/machines`, { headers: { cookie: customer.jar } }).then((r) =>
        r.json(),
      ),
    ]);
    result.counts.customerQuotes = cq.quotes?.length ?? 0;
    result.counts.customerQuoteLines = sumQuoteLines(cq.quotes);
    result.counts.customerMachines = cm.machines?.length ?? 0;
  }
  result.blobDerived = countsFromBlobBackup();
  if (result.blobDerived) {
    result.counts.quoteLines = result.blobDerived.quoteLines;
    result.counts.ticketActivities = result.blobDerived.ticketActivities;
    result.counts.users = result.blobDerived.users;
    result.counts.activityLogEvents = result.blobDerived.activityEvents;
    result.counts.entityShardFiles = result.blobDerived.entityShardFiles;
  }
  result.driftVsPreMerge378 = diffCounts(loadBaseline(), result.counts);
  writeFileSync(`${outDir}/${label}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
