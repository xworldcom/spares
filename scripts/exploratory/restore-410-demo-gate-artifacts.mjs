#!/usr/bin/env node
/**
 * Demo tenant only: close CAS gate / smoke artifact tickets on prod (no delete API).
 * OEE360_BASE_URL=https://oee360.com node scripts/exploratory/restore-410-demo-gate-artifacts.mjs
 */
const BASE = process.env.OEE360_BASE_URL ?? "https://oee360.com";
const STAFF = {
  email: process.env.OEE360_STAFF_A_EMAIL ?? "staff@demo.com",
  password: process.env.OEE360_STAFF_A_PASSWORD ?? "demo123456",
};

const CAS_TITLE = /^(CAS s[123] |cas gate test)/i;

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(STAFF),
  });
  if (!res.ok) {
    throw new Error(`login failed ${res.status} ${await res.text()}`);
  }
  const jar = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
  const me = await fetch(`${BASE}/api/auth/me`, { headers: { cookie: jar } }).then((r) =>
    r.json(),
  );
  if (me.user?.tenantId !== "tenant-oee360-host") {
    throw new Error(`refusing non-demo tenant ${me.user?.tenantId}`);
  }
  return jar;
}

async function readTicket(jar, id) {
  const res = await fetch(`${BASE}/api/tickets/${id}`, { headers: { cookie: jar } });
  const body = await res.json();
  return body.ticket;
}

async function closeTicket(jar, ticket) {
  if (ticket.status === "closed") {
    return { id: ticket.id, skipped: true, status: "closed" };
  }
  const res = await fetch(`${BASE}/api/tickets/${ticket.id}`, {
    method: "PATCH",
    headers: { cookie: jar, "content-type": "application/json" },
    body: JSON.stringify({
      status: "closed",
      recordVersion: ticket.recordVersion,
      baseStatus: ticket.status,
    }),
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  if (!res.ok) {
    return { id: ticket.id, error: res.status, body };
  }
  return {
    id: ticket.id,
    title: ticket.title,
    before: ticket.status,
    after: body.ticket?.status,
    ok: body.ticket?.status === "closed",
  };
}

async function main() {
  const jar = await login();
  const list = await fetch(`${BASE}/api/staff/tickets`, { headers: { cookie: jar } }).then((r) =>
    r.json(),
  );
  const tickets = (list.tickets ?? []).filter((t) => CAS_TITLE.test(t.title ?? ""));
  const before = tickets.map((t) => ({
    id: t.id,
    number: t.number,
    title: t.title,
    status: t.status,
  }));
  const results = [];
  for (const row of tickets) {
    const full = await readTicket(jar, row.id);
    results.push(await closeTicket(jar, full));
  }
  const staffB = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "staff-b@demo.com", password: STAFF.password }),
  }).then(async (res) => {
    const jarB = (res.headers.getSetCookie?.() ?? [])
      .map((c) => c.split(";")[0])
      .join("; ");
    const me = await fetch(`${BASE}/api/auth/me`, { headers: { cookie: jarB } }).then((r) =>
      r.json(),
    );
    return { ok: res.ok, user: me.user };
  });

  const report = {
    baseUrl: BASE,
    at: new Date().toISOString(),
    tenantId: "tenant-oee360-host",
    ticketsBefore: before,
    closeResults: results,
    staffB,
    quoteIdsTouched: [],
  };
  console.log(JSON.stringify(report, null, 2));
  const failed = results.some((r) => r.error || r.ok === false);
  process.exit(failed ? 1 : 0);
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
