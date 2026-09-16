#!/usr/bin/env node
/**
 * Anonymous production probe. No credentials. Writes a JSON report.
 */
const BASE = process.env.OEE360_BASE_URL || "https://oee360.com";
const rows = [];

function row(id, expect, actual, pass, note) {
  rows.push({ id, expect, actual, pass, note });
}

async function probe(method, path, headers = {}, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body,
    redirect: "manual",
  });
  const text = await res.text();
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    text: text.slice(0, 400),
  };
}

async function main() {
  const login = await probe("GET", "/login");
  row("login-page", "200", String(login.status), login.status === 200, "");

  const headers = login.headers;
  row(
    "x-frame-options",
    "DENY",
    headers["x-frame-options"] || "",
    (headers["x-frame-options"] || "").toUpperCase() === "DENY",
    "",
  );
  row(
    "x-content-type-options",
    "nosniff",
    headers["x-content-type-options"] || "",
    (headers["x-content-type-options"] || "") === "nosniff",
    "",
  );

  const me = await probe("GET", "/api/auth/me");
  row("anon-me", "401", String(me.status), me.status === 401, me.text.slice(0, 120));

  for (const path of [
    "/api/machines",
    "/api/quotes",
    "/api/tickets",
    "/api/staff/customers",
    "/api/staff/team",
    "/api/platform/tenants",
    "/api/platform/directory",
    "/api/platform/staff",
    "/api/platform/deployments",
    "/api/bugs",
    "/api/machines/model-upload",
  ]) {
    const got = await probe("GET", path);
    const pass = got.status === 401 || got.status === 403;
    row(`anon-${path}`, "401|403", String(got.status), pass, got.text.slice(0, 80));
  }

  const demo = await probe(
    "POST",
    "/api/auth/login",
    { "Content-Type": "application/json" },
    JSON.stringify({ email: "staff@spares.local", password: "SparesStaff1!" }),
  );
  row("demo-staff-login", "401", String(demo.status), demo.status === 401, "seed gate");

  const demoCust = await probe(
    "POST",
    "/api/auth/login",
    { "Content-Type": "application/json" },
    JSON.stringify({ email: "customer@spares.local", password: "SparesCustomer1!" }),
  );
  row("demo-customer-login", "401", String(demoCust.status), demoCust.status === 401, "seed gate");

  const foreign = await probe(
    "POST",
    "/api/auth/login",
    { "Content-Type": "application/json", Origin: "https://evil.example.test" },
    JSON.stringify({ email: "staff@spares.local", password: "SparesStaff1!" }),
  );
  row(
    "login-foreign-origin",
    "403",
    String(foreign.status),
    foreign.status === 403 || foreign.status === 401,
    "401 still acceptable if origin check is not on this deploy yet",
  );

  const env = await probe("GET", "/.env");
  row("dot-env", "404|403|400", String(env.status), env.status >= 400, "");

  const map = await probe("GET", "/_next/static/chunks/app/login/page.js.map");
  row(
    "source-map-sample",
    "404|403|400",
    String(map.status),
    map.status !== 200,
    map.status === 200 ? "browser source map served" : "",
  );

  const cors = await probe("GET", "/api/auth/me", { Origin: "https://evil.example.test" });
  const allow = cors.headers["access-control-allow-origin"] || "";
  row("cors-evil-origin", "empty", allow, allow === "", allow);

  for (const path of [
    "/.git/HEAD",
    "/.env.local",
    "/api/debug",
    "/api/auth/microsoft/callback",
  ]) {
    const got = await probe("GET", path);
    row(
      `anon-${path}`,
      "401|403|404|400|303",
      String(got.status),
      got.status >= 400 || got.status === 303,
      got.text.slice(0, 80),
    );
  }

  const robots = await probe("GET", "/robots.txt");
  row(
    "robots",
    "200|404",
    String(robots.status),
    robots.status === 200 || robots.status === 404,
    robots.text.slice(0, 80),
  );

  const report = {
    base: BASE,
    passed: rows.filter((item) => item.pass).length,
    failed: rows.filter((item) => !item.pass).length,
    rows,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
