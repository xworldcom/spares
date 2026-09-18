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
    expectStatus(
      "role",
      "cust-create-customer",
      (
        await api(custA, "POST", "/api/staff/customers", {
          email: `pentest-priv-${Date.now()}@spares.test`,
          password: "PentestPriv1!",
        })
      ).status,
      [403],
    );
    expectStatus(
      "role",
      "cust-create-staff",
      (
        await api(custA, "POST", "/api/staff/team", {
          email: `pentest-priv-staff-${Date.now()}@spares.test`,
          password: "PentestPriv1!",
        })
      ).status,
      [403],
    );
    expectStatus(
      "role",
      "cust-staff-tickets",
      (await api(custA, "GET", "/api/staff/tickets")).status,
      [403],
    );
    expectStatus(
      "role",
      "cust-preview-fixture",
      (await api(custA, "POST", "/api/staff/quotes/preview-fixture")).status,
      [403],
    );

    const quotesA = await api(custA, "GET", "/api/quotes");
    expectStatus("quotes", "cust-a-list", quotesA.status, [200]);
    const quotesB = custB.status === 200 ? await api(custB, "GET", "/api/quotes") : null;
    if (quotesA.status === 200 && quotesB?.status === 200) {
      const idsA = new Set((quotesA.json.quotes ?? []).map((q) => q.id));
      const leak = (quotesB.json.quotes ?? []).some((q) => idsA.has(q.id));
      row("quotes", "cust-b-sees-a-quote", "false", String(leak), !leak, "customerId filter");
    }

    const machinesA = await api(custA, "GET", "/api/machines");
    const machinesB = custB.status === 200 ? await api(custB, "GET", "/api/machines") : null;
    let exclusiveMachine;
    if (machinesA.status === 200 && machinesB?.status === 200) {
      const idsB = new Set((machinesB.json.machines ?? []).map((m) => m.id));
      exclusiveMachine = (machinesA.json.machines ?? []).find((m) => !idsB.has(m.id));
      if (exclusiveMachine && custB.status === 200) {
        const cross = await api(custB, "GET", `/api/machines/${exclusiveMachine.id}`);
        expectStatus("machines", "cust-b-read-a-machine", cross.status, [404]);
        const tickets = await api(custB, "GET", `/api/machines/${exclusiveMachine.id}/tickets`);
        expectStatus("care", "cust-b-tickets-on-a-machine", tickets.status, [404]);
        expectStatus(
          "role",
          "cust-b-usage",
          (await api(custB, "GET", `/api/machines/${exclusiveMachine.id}/usage`)).status,
          [403, 404],
        );
        expectStatus(
          "role",
          "cust-a-usage",
          (await api(custA, "GET", `/api/machines/${exclusiveMachine.id}/usage`)).status,
          [403],
        );
        expectStatus(
          "role",
          "cust-views",
          (await api(custA, "GET", `/api/staff/machines/${exclusiveMachine.id}/views`)).status,
          [403],
        );
        expectStatus(
          "anon",
          "anon-machine-file",
          (await api(null, "GET", `/api/machines/${exclusiveMachine.id}/file`)).status,
          [401, 403],
        );
      } else {
        row("care", "cust-b-tickets-on-a-machine", "404", "skipped", true, "no exclusive machine");
      }
    }

    let quoteId = (quotesA.json.quotes ?? [])[0]?.id;
    for (const machine of machinesA.json.machines ?? []) {
      if (quoteId) {
        break;
      }
      const detail = await api(custA, "GET", `/api/machines/${machine.id}`);
      const part = (detail.json.parts ?? [])[0];
      if (!part?.id) {
        continue;
      }
      const created = await api(custA, "POST", "/api/quotes", {
        machineId: machine.id,
        items: [{ id: part.id, qty: 1, sellPrice: 9999, supplierCost: 1 }],
        note: "<script>alert(1)</script>",
      });
      expectStatus("quotes", "cust-a-create", created.status, [201]);
      if (created.status === 201) {
        quoteId = created.json.quote.id;
        const priced = (created.json.quote.items ?? []).some((item) => item.sellPrice != null);
        row("quotes", "cust-create-strips-price", "false", String(priced), !priced, "");
        row(
          "xss",
          "quote-note-stored-as-text",
          "true",
          String(created.json.quote.note?.includes("<script>")),
          Boolean(created.json.quote.note?.includes("<script>")),
          "JSON text; React children escape on render",
        );
      }
    }

    if (quoteId && custB.status === 200) {
      expectStatus(
        "quotes",
        "cust-b-read-a-quote",
        (await api(custB, "GET", `/api/quotes/${quoteId}`)).status,
        [403, 404],
      );
      expectStatus(
        "quotes",
        "cust-b-patch-a-quote",
        (await api(custB, "PATCH", `/api/quotes/${quoteId}`, { poNumber: "HACK" })).status,
        [403, 404],
      );
      expectStatus(
        "quotes",
        "cust-b-activity",
        (await api(custB, "POST", `/api/quotes/${quoteId}/activity`, { text: "cross" })).status,
        [403, 404],
      );
      expectStatus(
        "quotes",
        "cust-b-po",
        (await api(custB, "GET", `/api/quotes/${quoteId}/po`)).status,
        [403, 404],
      );
      expectStatus(
        "quotes",
        "cust-b-attachment",
        (
          await api(
            custB,
            "GET",
            `/api/quotes/${quoteId}/attachments/chat-00000000-0000-0000-0000-000000000000.png`,
          )
        ).status,
        [403, 404],
      );
    }
    if (quoteId) {
      expectStatus(
        "quotes",
        "cust-a-status-escalate",
        (
          await api(custA, "PATCH", `/api/quotes/${quoteId}`, {
            status: "quoted",
            items: [{ id: "x", qty: 1, sellPrice: 1 }],
          })
        ).status,
        [403],
      );
    }

    if (exclusiveMachine && custB.status === 200) {
      const ticket = await api(custA, "POST", `/api/machines/${exclusiveMachine.id}/tickets`, {
        title: "Pentest isolation ticket",
        note: "local disposable",
      });
      expectStatus("care", "cust-a-create-ticket", ticket.status, [201]);
      if (ticket.status === 201) {
        const ticketId = ticket.json.ticket.id;
        expectStatus(
          "care",
          "cust-b-read-ticket",
          (await api(custB, "GET", `/api/tickets/${ticketId}`)).status,
          [403, 404],
        );
        expectStatus(
          "care",
          "cust-b-patch-ticket",
          (await api(custB, "PATCH", `/api/tickets/${ticketId}`, { status: "closed" })).status,
          [403, 404],
        );
        expectStatus(
          "care",
          "cust-a-status-escalate",
          (await api(custA, "PATCH", `/api/tickets/${ticketId}`, { status: "closed" })).status,
          [403],
        );
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
            const hostQuote = (hostQuotes.json.quotes ?? [])[0];
            if (hostQuote) {
              expectStatus(
                "tenant",
                "sat-read-host-quote-id",
                (await api(satStaff, "GET", `/api/quotes/${hostQuote.id}`)).status,
                [403, 404],
              );
            }
            const hostPeople = staff.status === 200
              ? await api(staff, "GET", "/api/staff/customers")
              : { json: { customers: [] } };
            const hostPerson = (hostPeople.json.customers ?? [])[0];
            if (hostPerson) {
              expectStatus(
                "tenant",
                "sat-patch-host-person",
                (
                  await api(satStaff, "PATCH", `/api/staff/customers/${hostPerson.id}`, {
                    name: "Stolen",
                  })
                ).status,
                [403, 404],
              );
            }
            expectStatus(
              "tenant",
              "sat-create-host-staff",
              (
                await api(satStaff, "POST", "/api/staff/team", {
                  email: `pentest-sat-host-${Date.now()}@spares.test`,
                  password: "PentestSatStaff1!",
                  tenantId: "tenant-oee360-host",
                })
              ).status,
              [403],
            );
            if (hostIds[0]) {
              const satCust = await api(satStaff, "POST", "/api/staff/customers", {
                email: `pentest-sat-grant-${Date.now()}@spares.test`,
                password: "PentestSatCust1!",
                machineIds: hostIds,
              });
              expectStatus("tenant", "sat-create-customer", satCust.status, [201]);
              const granted = satCust.json.user?.machineIds ?? [];
              const grantLeak = granted.some((id) => hostIds.includes(id));
              row("tenant", "sat-grant-host-machine", "false", String(grantLeak), !grantLeak, "");
            }
          }
        }
      }
    }
  } else {
    row("platform", "owner-login", "200", "skipped", true, "no owner credentials in env");
  }

  const managed =
    process.env.SPARES_ALLOW_SEED === "false" ||
    BASE.includes("oee360.com");
  if (managed) {
    const demo = await login("staff@spares.local", "SparesStaff1!");
    expectStatus("auth", "demo-seed-on-managed", demo.status, [401, 403]);
  }

  const foreignBug = await fetch(`${BASE}/api/bugs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://evil.example.test",
    },
    body: JSON.stringify({ description: "pentest foreign origin" }),
  });
  expectStatus("auth", "bugs-foreign-origin", foreignBug.status, [403], "cross-site bug POST");

  const anonBug = await fetch(`${BASE}/api/bugs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description: "pentest anonymous bug report" }),
  });
  expectStatus("auth", "bugs-anon-post", anonBug.status, [401], "bug POST requires session");

  if (staff.status === 200) {
    const setCookie =
      typeof staff.headers.getSetCookie === "function"
        ? staff.headers.getSetCookie().join("; ")
        : staff.headers.get("set-cookie") || "";
    row(
      "auth",
      "session-httponly",
      "true",
      String(/httponly/i.test(setCookie)),
      /httponly/i.test(setCookie),
      "",
    );
    row(
      "auth",
      "session-samesite-lax",
      "true",
      String(/samesite=lax/i.test(setCookie)),
      /samesite=lax/i.test(setCookie),
      "",
    );

    const throwaway = `pentest-del-${Date.now()}@spares.test`;
    const created = await api(staff, "POST", "/api/staff/customers", {
      email: throwaway,
      password: "PentestDelete1!",
    });
    expectStatus("auth", "create-throwaway", created.status, [201]);
    if (created.status === 201 && created.json.user?.id) {
      const removed = await api(staff, "DELETE", `/api/staff/customers/${created.json.user.id}`);
      expectStatus("auth", "delete-throwaway", removed.status, [200]);
      const afterDelete = await login(throwaway, "PentestDelete1!");
      expectStatus("auth", "deleted-user-login", afterDelete.status, [401]);
    }

    const roleProbe = await api(staff, "POST", "/api/staff/customers", {
      email: `pentest-role-${Date.now()}@spares.test`,
      password: "PentestRole1!",
      role: "staff",
    });
    expectStatus("role", "staff-create-ignores-role", roleProbe.status, [201]);
    if (roleProbe.status === 201) {
      row(
        "role",
        "created-role-is-customer",
        "customer",
        roleProbe.json.user?.role ?? "",
        roleProbe.json.user?.role === "customer",
        "client role field ignored",
      );
    }

    const beforeLogout = staff.cookie;
    await api(staff, "POST", "/api/auth/logout");
    const afterLogout = await api({ cookie: beforeLogout }, "GET", "/api/auth/me");
    row(
      "auth",
      "logout-clears-cookie-only",
      "200-or-401",
      String(afterLogout.status),
      afterLogout.status === 200 || afterLogout.status === 401,
      "JWT stays valid until exp if the old value is resent (Low ticket)",
    );
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
