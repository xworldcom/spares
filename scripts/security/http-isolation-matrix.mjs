#!/usr/bin/env node
/**
 * HTTP isolation matrix. Expects a disposable local store or throwaway
 * Production accounts. Prints JSON. Does not print passwords.
 *
 * Local:
 *   SPARES_DATA_DIR=/tmp/pentest SPARES_ALLOW_SEED=true \
 *   SPARES_OWNER_EMAIL=owner@pentest.local SPARES_OWNER_PASSWORD='...' \
 *   SPARES_PLATFORM_OWNER_EMAILS=owner@pentest.local \
 *   npm run dev -- --port 3020
 *   node scripts/security/http-isolation-matrix.mjs --base-url http://127.0.0.1:3020
 */
function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const BASE = argValue("--base-url") || process.env.OEE360_BASE_URL || "http://127.0.0.1:3020";

const OWNER = {
  email: process.env.SPARES_OWNER_EMAIL || process.env.OEE360_OWNER_EMAIL,
  password: process.env.SPARES_OWNER_PASSWORD || process.env.OEE360_OWNER_PASSWORD,
};
const HOST_STAFF = {
  email: process.env.OEE360_STAFF_EMAIL || "staff@spares.local",
  password: process.env.OEE360_STAFF_PASSWORD || "SparesStaff1!",
};
const CUST_A = {
  email: process.env.OEE360_CUST_A_EMAIL || "customer@spares.local",
  password: process.env.OEE360_CUST_A_PASSWORD || "SparesCustomer1!",
};
const CUST_B = {
  email: process.env.OEE360_CUST_B_EMAIL || "buyer@acme.test",
  password: process.env.OEE360_CUST_B_PASSWORD || "SparesCustomer1!",
};

const rows = [];

function row(area, id, expect, actual, pass, note) {
  rows.push({ area, id, expect, actual, pass, note });
}

function cookieFrom(res) {
  const setCookie =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie")]
        : [];
  return setCookie
    .map((value) => value.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

async function login(email, password, extraHeaders = {}) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, cookie: cookieFrom(res), headers: res.headers };
}

async function api(session, method, path, payload) {
  const headers = {};
  if (session?.cookie) headers.Cookie = session.cookie;
  let body;
  if (payload !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(payload);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 240) };
  }
  return { status: res.status, json };
}

function expectStatus(area, id, got, allowed, note = "") {
  const pass = allowed.includes(got);
  row(area, id, allowed.join("|"), String(got), pass, note);
}

async function main() {
  const anonMe = await api(null, "GET", "/api/auth/me");
  expectStatus("auth", "anon-me", anonMe.status, [401]);

  for (const path of [
    "/api/machines",
    "/api/quotes",
    "/api/tickets",
    "/api/staff/customers",
    "/api/staff/team",
    "/api/platform/tenants",
    "/api/platform/directory",
    "/api/bugs",
  ]) {
    const got = await api(null, "GET", path);
    expectStatus("anon", `anon-GET ${path}`, got.status, [401, 403]);
  }

  const foreign = await login(
    HOST_STAFF.email,
    HOST_STAFF.password,
    { Origin: "https://evil.example.test" },
  );
  expectStatus("auth", "login-foreign-origin", foreign.status, [403], "cross-site login POST");

  const staff = await login(HOST_STAFF.email, HOST_STAFF.password);
  expectStatus("auth", "host-staff-login", staff.status, [200, 401]);

  const custA = await login(CUST_A.email, CUST_A.password);
  expectStatus("auth", "cust-a-login", custA.status, [200, 401]);

  const custB = await login(CUST_B.email, CUST_B.password);
  expectStatus("auth", "cust-b-login", custB.status, [200, 401]);

  if (staff.status === 200) {
    const platform = await api(staff, "GET", "/api/platform/tenants");
    expectStatus("platform", "host-staff-tenants", platform.status, [403]);
    const directory = await api(staff, "GET", "/api/platform/directory");
    expectStatus("platform", "host-staff-directory", directory.status, [403]);
    const teamForeign = await api(
      staff,
      "GET",
      "/api/staff/team?tenantId=tenant-does-not-exist",
    );
    expectStatus("tenant", "host-staff-foreign-team", teamForeign.status, [403, 404]);
  }

  if (custA.status === 200) {
    expectStatus(
      "role",
      "cust-staff-customers",
      (await api(custA, "GET", "/api/staff/customers")).status,
      [403],
    );
    expectStatus(
      "role",
      "cust-platform-tenants",
      (await api(custA, "GET", "/api/platform/tenants")).status,
      [403],
    );
    expectStatus(
      "role",
      "cust-model-upload",
      (await api(custA, "GET", "/api/machines/model-upload")).status,
      [403],
    );
    expectStatus(
      "role",
      "cust-bugs-list",
      (await api(custA, "GET", "/api/bugs")).status,
      [403],
    );

    const quotesA = await api(custA, "GET", "/api/quotes");
    expectStatus("quotes", "cust-a-list", quotesA.status, [200]);
    const quotesB = custB.status === 200 ? await api(custB, "GET", "/api/quotes") : null;
    if (quotesA.status === 200 && quotesB?.status === 200) {
      const idsA = new Set((quotesA.json.quotes ?? []).map((q) => q.id));
      const leak = (quotesB.json.quotes ?? []).some((q) => idsA.has(q.id));
      row("quotes", "cust-b-sees-a-quote", "false", String(leak), !leak, "customerId filter");
      const firstA = (quotesA.json.quotes ?? [])[0];
      if (firstA) {
        const cross = await api(custB, "GET", `/api/quotes/${firstA.id}`);
        expectStatus("quotes", "cust-b-read-a-quote", cross.status, [403, 404]);
      }
    }

    const machinesA = await api(custA, "GET", "/api/machines");
    const machinesB = custB.status === 200 ? await api(custB, "GET", "/api/machines") : null;
    if (machinesA.status === 200 && machinesB?.status === 200) {
      const idsB = new Set((machinesB.json.machines ?? []).map((m) => m.id));
      const onlyA = (machinesA.json.machines ?? []).filter((m) => !idsB.has(m.id));
      if (onlyA[0] && custB.status === 200) {
        const cross = await api(custB, "GET", `/api/machines/${onlyA[0].id}`);
        expectStatus("machines", "cust-b-read-a-machine", cross.status, [404]);
        const tickets = await api(custB, "GET", `/api/machines/${onlyA[0].id}/tickets`);
        expectStatus("care", "cust-b-tickets-on-a-machine", tickets.status, [404]);
      } else {
        row("care", "cust-b-tickets-on-a-machine", "404", "skipped", true, "no exclusive machine");
      }
    }
  }

  if (OWNER.email && OWNER.password) {
    const owner = await login(OWNER.email, OWNER.password);
    expectStatus("auth", "owner-login", owner.status, [200]);
    if (owner.status === 200) {
      const tenants = await api(owner, "GET", "/api/platform/tenants");
      expectStatus("platform", "owner-tenants", tenants.status, [200]);
      if (tenants.status === 200) {
        const stamp = Date.now();
        const created = await api(owner, "POST", "/api/platform/tenants", {
          name: `Pentest Sat ${stamp}`,
          staffEmail: `sat-staff-${stamp}@spares.test`,
          staffPassword: "PentestSatStaff1!",
        });
        expectStatus("platform", "owner-create-satellite", created.status, [201]);
        if (created.status === 201 && created.json.staffUser) {
          const satStaff = await login(
            created.json.staffUser.email,
            "PentestSatStaff1!",
          );
          expectStatus("auth", "sat-staff-login", satStaff.status, [200]);
          if (satStaff.status === 200) {
            const satMachines = await api(satStaff, "GET", "/api/machines");
            expectStatus("tenant", "sat-staff-machines", satMachines.status, [200]);
            const hostIds = staff.status === 200
              ? ((await api(staff, "GET", "/api/machines")).json.machines ?? []).map((m) => m.id)
              : [];
            const leak = (satMachines.json.machines ?? []).some((m) => hostIds.includes(m.id));
            row("tenant", "sat-staff-sees-host-machine", "false", String(leak), !leak, "");
            const satQuotes = await api(satStaff, "GET", "/api/quotes");
            const hostQuotes = staff.status === 200 ? await api(staff, "GET", "/api/quotes") : { json: { quotes: [] } };
            const qLeak = (satQuotes.json.quotes ?? []).some((q) =>
              (hostQuotes.json.quotes ?? []).some((h) => h.id === q.id),
            );
            row("tenant", "sat-staff-sees-host-quote", "false", String(qLeak), !qLeak, "");
            expectStatus(
              "platform",
              "sat-staff-tenants",
              (await api(satStaff, "GET", "/api/platform/tenants")).status,
              [403],
            );
          }
        }
      }
    }
  } else {
    row("platform", "owner-login", "200", "skipped", true, "no owner credentials in env");
  }

  const demo = await login("staff@spares.local", "SparesStaff1!");
  if (process.env.SPARES_ALLOW_SEED === "false" || process.env.OEE360_BASE_URL?.includes("oee360.com")) {
    expectStatus("auth", "demo-seed-on-managed", demo.status, [401, 403]);
  }

  const failed = rows.filter((item) => !item.pass);
  const report = {
    base: BASE,
    passed: rows.filter((item) => item.pass).length,
    failed: failed.length,
    rows,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
