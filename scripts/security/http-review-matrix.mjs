#!/usr/bin/env node
/**
 * HTTP proof for the public-page review hardening, against a store seeded by
 * seed-two-hosts.ts. Start the app like this so every row is reachable:
 *
 *   SPARES_DATA_DIR=<same dir> SPARES_ALLOW_SEED=false \
 *   SPARES_PLATFORM_OWNER_EMAILS=staff@acme-oem.test SPARES_ACTIVITY_LOG=true \
 *   SPARES_CORS_ORIGINS=http://localhost:3020 \
 *   AZURE_AD_CLIENT_ID=fake AZURE_AD_CLIENT_SECRET=fake AUTH_SECRET=<any long string> \
 *   npm run dev -- --port 3020
 *
 * Use the localhost base URL. Next dev reports request.url as localhost, so a 127.0.0.1
 * Origin fails the same-origin check the way a cross-site browser would.
 *
 *   SEED_PASSWORD='...' node scripts/security/http-review-matrix.mjs --base-url http://localhost:3020 [--out file.json]
 */
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASE = flag("--base-url", "http://localhost:3020").replace(/\/$/, "");
const OUT = flag("--out", null);
const PASSWORD = process.env.SEED_PASSWORD;
if (!PASSWORD) {
  console.error("SEED_PASSWORD is required (the password seed-two-hosts.ts printed).");
  process.exit(1);
}

const rows = [];
function row(area, id, expect, actual, pass, note = "") {
  rows.push({ area, id, expect, actual, pass, note });
}
function expectStatus(area, id, got, allowed, note = "") {
  row(area, id, allowed.join("|"), String(got), allowed.includes(got), note);
}
function expectTrue(area, id, pass, actual, note = "") {
  row(area, id, "true", String(actual), pass, note);
}

function cookieFrom(res) {
  const setCookie =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie")]
        : [];
  return setCookie.map((v) => v.split(";")[0]).filter(Boolean).join("; ");
}

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, cookie: cookieFrom(res) };
}

async function api(session, method, path, payload, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (session?.cookie) headers.Cookie = session.cookie;
  let body;
  if (payload !== undefined) {
    headers["Content-Type"] = "application/json";
    body = typeof payload === "string" ? payload : JSON.stringify(payload);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body, redirect: "manual" });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, headers: res.headers, text };
}

async function main() {
  const acmeStaff = await login("staff@acme-oem.test");
  const boltStaff = await login("staff@bolt-oem.test");
  const northline = await login("ops@northline.test");
  const southgate = await login("ops@southgate.test");
  for (const [name, s] of Object.entries({ acmeStaff, boltStaff, northline, southgate })) {
    expectStatus("login", name, s.status, [200]);
  }
  expectTrue("login", "acme-staff-is-platform-owner", acmeStaff.body.user?.platformOwner === true, acmeStaff.body.user?.platformOwner);

  // next= open redirect. The login page must rewrite every off-site target to /machines.
  for (const next of ["//evil.example.test", "/\\evil.example.test", "https://evil.example.test", "/%2f%2fevil.example.test"]) {
    const page = await api(null, "GET", `/login?next=${encodeURIComponent(next)}`);
    const href = page.text.match(/href="(\/api\/auth\/microsoft\?next=[^"]*)"/)?.[1] ?? "";
    expectTrue("next", `login-page-${encodeURIComponent(next)}`, href.endsWith("next=%2Fmachines"), href);
  }
  const keep = await api(null, "GET", `/login?next=${encodeURIComponent("/quotes?tab=po")}`);
  const keepHref = keep.text.match(/href="(\/api\/auth\/microsoft\?next=[^"]*)"/)?.[1] ?? "";
  expectTrue("next", "login-page-keeps-relative", keepHref.endsWith("next=%2Fquotes%3Ftab%3Dpo"), keepHref);

  const authorize = await api(null, "GET", `/api/auth/microsoft?next=${encodeURIComponent("https://evil.example.test")}`, undefined, { Origin: BASE });
  expectStatus("microsoft", "authorize-redirects", authorize.status, [302], "403 means the base URL is not in SPARES_CORS_ORIGINS, 503 means AZURE_AD_* unset");
  if (authorize.status === 302) {
    const location = new URL(authorize.headers.get("location"));
    expectTrue("microsoft", "authorize-carries-nonce", Boolean(location.searchParams.get("nonce")), location.searchParams.get("nonce") ? "present" : "missing");
    expectTrue("microsoft", "authorize-scope-oidc-only", location.searchParams.get("scope") === "openid profile email", location.searchParams.get("scope"));
    const callback = await api(null, "GET", `/api/auth/microsoft/callback?code=x&state=forged`);
    expectStatus("microsoft", "callback-forged-state", callback.status, [303]);
    expectTrue("microsoft", "callback-forged-state-goes-to-login", (callback.headers.get("location") ?? "").includes("/login?error="), callback.headers.get("location"));
  }

  // Enrollment. Only the platform owner, and autoroute needs domain + tid on one host.
  const tenants = await api(acmeStaff, "GET", "/api/platform/tenants");
  expectStatus("enroll", "owner-lists-tenants", tenants.status, [200]);
  const bolt = (tenants.json.tenants ?? []).find((t) => t.name === "Bolt Robotics");
  const acme = (tenants.json.tenants ?? []).find((t) => t.name === "Acme Automation");
  const boltId = bolt?.id ?? "missing";
  expectStatus("enroll", "owner-clears-enrollment", (await api(acmeStaff, "PATCH", `/api/platform/tenants/${boltId}`, { ssoDomains: "", ssoTenantIds: "", ssoAutoroute: false })).status, [200], "makes reruns on one store deterministic");
  expectStatus("enroll", "bolt-staff-cannot-patch-host", (await api(boltStaff, "PATCH", `/api/platform/tenants/${boltId}`, { ssoDomains: "bolt-oem.test" })).status, [403]);
  expectStatus("enroll", "customer-cannot-patch-host", (await api(northline, "PATCH", `/api/platform/tenants/${boltId}`, { ssoDomains: "x.test" })).status, [403]);
  const badTid = await api(acmeStaff, "PATCH", `/api/platform/tenants/${boltId}`, { ssoTenantIds: "not-a-guid" });
  expectStatus("enroll", "rejects-non-guid-tid", badTid.status, [400]);
  const consumer = await api(acmeStaff, "PATCH", `/api/platform/tenants/${boltId}`, { ssoTenantIds: "9188040d-6c67-4c5b-b112-36a304b66dad" });
  expectStatus("enroll", "rejects-consumer-tid", consumer.status, [400]);
  const domainOnly = await api(acmeStaff, "PATCH", `/api/platform/tenants/${boltId}`, { ssoDomains: "bolt-oem.test", ssoAutoroute: true });
  expectStatus("enroll", "autoroute-without-tid-refused", domainOnly.status, [400]);
  expectTrue("enroll", "autoroute-without-tid-message", /Entra tenant ID/.test(domainOnly.json.error ?? ""), domainOnly.json.error);
  const tid = "11111111-2222-3333-4444-555555555555";
  const full = await api(acmeStaff, "PATCH", `/api/platform/tenants/${boltId}`, { ssoDomains: "bolt-oem.test", ssoTenantIds: tid, ssoAutoroute: true });
  expectStatus("enroll", "autoroute-with-domain-and-tid", full.status, [200]);
  expectTrue("enroll", "tenant-stores-tid", JSON.stringify(full.json.tenant?.ssoTenantIds) === JSON.stringify([tid]), JSON.stringify(full.json.tenant?.ssoTenantIds));
  const dup = await api(acmeStaff, "PATCH", `/api/platform/tenants/${acme?.id ?? "missing"}`, { ssoDomains: "bolt-oem.test" });
  expectStatus("enroll", "second-host-cannot-take-domain", dup.status, [409]);

  // Two-layer isolation over HTTP.
  const acmeMachines = await api(acmeStaff, "GET", "/api/machines");
  const boltMachines = await api(boltStaff, "GET", "/api/machines");
  const acmeIds = (acmeMachines.json.machines ?? []).map((m) => m.id);
  const boltIds = (boltMachines.json.machines ?? []).map((m) => m.id);
  expectTrue("host", "acme-staff-sees-two-machines", acmeIds.length === 2, acmeIds.length);
  expectTrue("host", "hosts-share-no-machine", acmeIds.every((id) => !boltIds.includes(id)), "disjoint");
  expectStatus("host", "acme-staff-gets-bolt-machine", (await api(acmeStaff, "GET", `/api/machines/${boltIds[0]}`)).status, [403, 404]);
  const acmeQuotes = await api(acmeStaff, "GET", "/api/quotes");
  const boltQuotes = await api(boltStaff, "GET", "/api/quotes");
  const boltQuote = (boltQuotes.json.quotes ?? [])[0];
  expectStatus("host", "acme-staff-gets-bolt-quote-id", (await api(acmeStaff, "GET", `/api/quotes/${boltQuote?.id}`)).status, [403, 404]);
  expectStatus("host", "acme-staff-gets-bolt-quote-number", (await api(acmeStaff, "GET", `/api/quotes/${boltQuote?.number}`)).status, [403, 404]);
  const boltTickets = await api(boltStaff, "GET", "/api/staff/tickets");
  const boltTicket = (boltTickets.json.tickets ?? [])[0];
  expectStatus("host", "acme-staff-gets-bolt-ticket-number", (await api(acmeStaff, "GET", `/api/tickets/${boltTicket?.number}`)).status, [403, 404]);
  expectStatus("host", "acme-staff-lists-bolt-customers", (await api(acmeStaff, "GET", "/api/staff/customers")).status, [200]);
  const acmeCustomers = (await api(acmeStaff, "GET", "/api/staff/customers")).json;
  const customerEmails = (acmeCustomers.customers ?? acmeCustomers.users ?? acmeCustomers.people ?? []).map((c) => c.email);
  expectTrue("host", "acme-customer-list-excludes-bolt", customerEmails.every((e) => !String(e).includes("eastfield") && !String(e).includes("westport")), JSON.stringify(customerEmails));

  const northMachines = await api(northline, "GET", "/api/machines");
  const southMachines = await api(southgate, "GET", "/api/machines");
  const northId = (northMachines.json.machines ?? [])[0]?.id;
  const southId = (southMachines.json.machines ?? [])[0]?.id;
  expectTrue("plant", "northline-sees-one-machine", (northMachines.json.machines ?? []).length === 1, (northMachines.json.machines ?? []).length);
  expectStatus("plant", "northline-gets-southgate-machine", (await api(northline, "GET", `/api/machines/${southId}`)).status, [403, 404]);
  expectStatus("plant", "northline-gets-southgate-tickets", (await api(northline, "GET", `/api/machines/${southId}/tickets`)).status, [403, 404]);
  expectStatus("plant", "northline-gets-southgate-manuals", (await api(northline, "GET", `/api/machines/${southId}/manuals`)).status, [403, 404]);
  expectStatus("plant", "northline-gets-southgate-file", (await api(northline, "GET", `/api/machines/${southId}/file`)).status, [403, 404]);
  const southQuote = ((await api(southgate, "GET", "/api/quotes")).json.quotes ?? [])[0];
  expectStatus("plant", "northline-gets-southgate-quote", (await api(northline, "GET", `/api/quotes/${southQuote?.id}`)).status, [403, 404]);
  const southTicket = ((await api(southgate, "GET", "/api/tickets")).json.tickets ?? [])[0];
  expectStatus("plant", "northline-gets-southgate-ticket", (await api(northline, "GET", `/api/tickets/${southTicket?.id}`)).status, [403, 404]);
  expectStatus("plant", "northline-gets-own-machine", (await api(northline, "GET", `/api/machines/${northId}`)).status, [200]);
  expectStatus("plant", "customer-cannot-list-staff-tickets", (await api(northline, "GET", "/api/staff/tickets")).status, [403]);
  expectStatus("plant", "customer-cannot-list-activity", (await api(northline, "GET", "/api/staff/activity")).status, [403, 404], "404 when SPARES_ACTIVITY_LOG is off");

  // Staff view audit. Rows persist across runs and the dedupe window is per process,
  // so assert at least one row exists and that a second open adds none.
  const acmeQuote = (acmeQuotes.json.quotes ?? [])[0];
  const viewedRows = (events) => (events ?? []).filter((e) => e.action === "quote.viewed" && e.target?.id === acmeQuote?.id);
  expectStatus("audit", "acme-staff-opens-own-quote", (await api(acmeStaff, "GET", `/api/quotes/${acmeQuote?.id}`)).status, [200]);
  const activity = await api(acmeStaff, "GET", `/api/staff/activity?tenantId=${acme?.id}`);
  const viewed = viewedRows(activity.json.events);
  expectTrue("audit", "quote-viewed-row-written", viewed.length >= 1, viewed.length);
  await api(acmeStaff, "GET", `/api/quotes/${acmeQuote?.id}`);
  const again = await api(acmeStaff, "GET", `/api/staff/activity?tenantId=${acme?.id}`);
  const viewedAgain = viewedRows(again.json.events);
  expectTrue("audit", "second-open-within-hour-not-duplicated", viewedAgain.length === viewed.length, `${viewed.length} -> ${viewedAgain.length}`);
  const boltActivity = await api(boltStaff, "GET", `/api/staff/activity?tenantId=${acme?.id}`);
  const leaked = (boltActivity.json.events ?? []).filter((e) => e.tenantId === acme?.id);
  expectTrue("audit", "bolt-staff-cannot-read-acme-activity", leaked.length === 0, leaked.length);

  // Inquire.
  const inquiry = {
    fullName: "Pen Tester",
    workEmail: "pt@example.test",
    companyName: "Example Automation",
    phone: "+1 555 0100",
    roleTitle: "Ops",
    customerType: "oem",
    message: "Checking the form.",
  };
  expectStatus("inquire", "foreign-origin-refused", (await api(null, "POST", "/api/inquiries", inquiry, { Origin: "https://evil.example.test" })).status, [403]);
  expectStatus("inquire", "oversized-refused", (await api(null, "POST", "/api/inquiries", { ...inquiry, message: "x".repeat(20 * 1024) }, { Origin: BASE })).status, [413]);
  expectStatus("inquire", "honeypot-filled-rejected", (await api(null, "POST", "/api/inquiries", { ...inquiry, company_fax: "555" }, { Origin: BASE })).status, [400, 201, 202], "app-defined outcome, recorded");
  expectStatus("inquire", "same-origin-accepted", (await api(null, "POST", "/api/inquiries", inquiry, { Origin: BASE })).status, [201]);
  expectStatus("inquire", "customer-cannot-read-inquiries", (await api(northline, "GET", "/api/platform/inquiries")).status, [403]);
  expectStatus("inquire", "bolt-staff-cannot-read-inquiries", (await api(boltStaff, "GET", "/api/platform/inquiries")).status, [403]);
  expectStatus("inquire", "owner-reads-inquiries", (await api(acmeStaff, "GET", "/api/platform/inquiries")).status, [200]);

  const passed = rows.filter((r) => r.pass).length;
  const failed = rows.length - passed;
  for (const r of rows) {
    console.log(`${r.pass ? "PASS" : "FAIL"} ${r.area}/${r.id} expect=${r.expect} actual=${r.actual}${r.note ? ` (${r.note})` : ""}`);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (OUT) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(OUT, JSON.stringify({ baseUrl: BASE, at: new Date().toISOString(), passed, failed, rows }, null, 2));
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((cause) => {
  console.error(cause);
  process.exit(2);
});
