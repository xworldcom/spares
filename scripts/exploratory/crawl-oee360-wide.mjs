#!/usr/bin/env node
/**
 * Wide production crawl: remaining staff, customer, and platform APIs.
 * Prints JSON. Does not delete protected demos. Soft-deletes only a throwaway.
 */
const BASE = process.env.OEE360_BASE_URL || "https://oee360.com";
const STAFF = {
  email: process.env.OEE360_STAFF_EMAIL,
  password: process.env.OEE360_STAFF_PASSWORD,
};
const CUST_A = {
  email: process.env.OEE360_CUST_A_EMAIL,
  password: process.env.OEE360_CUST_A_PASSWORD,
};
const CUST_B = {
  email: process.env.OEE360_CUST_B_EMAIL,
  password: process.env.OEE360_CUST_B_PASSWORD,
};
if (!STAFF.email || !STAFF.password || !CUST_A.email || !CUST_A.password || !CUST_B.email || !CUST_B.password) {
  console.error("Set OEE360_STAFF_EMAIL/PASSWORD and OEE360_CUST_A_* plus OEE360_CUST_B_*");
  process.exit(2);
}

const findings = [];
const coverage = [];

function cover(level, feature, result, note) {
  coverage.push({ level, feature, result, note });
}

function find(severity, id, title, extra) {
  findings.push({ severity, id, title, ...extra });
}

function snippet(json) {
  const s = JSON.stringify(json);
  return s.length > 500 ? `${s.slice(0, 500)}…` : s;
}

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  const setCookie =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie")]
        : [];
  const cookie = setCookie
    .map((c) => c.split(";")[0])
    .filter(Boolean)
    .join("; ");
  return { status: res.status, body, cookie, email };
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
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, json, text: text.slice(0, 800) };
}

function expectDenied(res, level, feature, path) {
  const ok = res.status === 401 || res.status === 403 || res.status === 404;
  cover(level, feature, ok ? "ok" : "fail", `${path} ${res.status}`);
  if (!ok) {
    find("CODE_RED", `authz-${path}`, `Unexpected success on ${path}`, {
      steps: [path],
      expected: "401/403/404",
      actual: `${res.status} ${snippet(res.json)}`,
      urls: [path],
      response: snippet(res.json),
    });
  }
  return ok;
}

async function main() {
  const staff = await login(STAFF.email, STAFF.password);
  const custA = await login(CUST_A.email, CUST_A.password);
  const custB = await login(CUST_B.email, CUST_B.password);
  if (staff.status !== 200 || custA.status !== 200 || custB.status !== 200) {
    find("blocker", "login", "Wide crawl login failed", {
      actual: `${staff.status}/${custA.status}/${custB.status}`,
    });
    console.log(JSON.stringify({ findings, coverage }, null, 2));
    process.exit(1);
  }
  cover("staff", "login", "ok", staff.email);
  cover("customer", "login A", "ok", CUST_A.email);
  cover("customer", "login B", "ok", CUST_B.email);

  const staffMe = await api(staff, "GET", "/api/auth/me");
  const aMe = await api(custA, "GET", "/api/auth/me");
  const bMe = await api(custB, "GET", "/api/auth/me");
  cover("staff", "me", staffMe.status === 200 ? "ok" : "fail", snippet(staffMe.json.user || staffMe.json));
  cover("customer", "me A", aMe.status === 200 ? "ok" : "fail", aMe.json.user?.id);
  cover("customer", "me B", bMe.status === 200 ? "ok" : "fail", bMe.json.user?.id);
  const aUserId = aMe.json.user?.id;
  const bUserId = bMe.json.user?.id;

  const aTickets = await api(custA, "GET", "/api/tickets");
  const aList = aTickets.json.tickets || [];
  const aOwn = aList.find((t) => t.customerEmail === CUST_A.email) || aList[0];
  const foreign = aList.find((t) => t.customerEmail && t.customerEmail !== CUST_A.email);
  cover("customer", "list tickets A", aTickets.status === 200 ? "ok" : "fail", `n=${aList.length}`);

  if (aOwn) {
    const byNumber = await api(custA, "GET", `/api/tickets/${aOwn.number}`);
    cover("customer", "GET ticket by number", byNumber.status === 200 ? "ok" : "fail", `${byNumber.status}`);
    const byId = await api(custA, "GET", `/api/tickets/${aOwn.id}`);
    cover("customer", "GET ticket by UUID", byId.status === 200 ? "ok" : "fail", `${byId.status}`);
    if (byNumber.status === 200 && byNumber.json.ticket?.id !== aOwn.id) {
      find("major", "ticket-number-mismatch", "Numeric ticket GET returned a different ticket", {
        roleA: CUST_A.email,
        steps: [`GET /api/tickets/${aOwn.number}`],
        expected: aOwn.id,
        actual: byNumber.json.ticket?.id,
        urls: [`GET /api/tickets/${aOwn.number}`],
        response: snippet(byNumber.json),
      });
    }
  }

  if (foreign) {
    const att = (foreign.activities || []).flatMap((act) => act.attachments || []);
    if (att[0]?.r2Key) {
      const stored = att[0].r2Key.replace(/^chat\//, "");
      const dl = await api(custA, "GET", `/api/tickets/${foreign.id}/attachments/${stored}`);
      if (dl.status === 200) {
        find("CODE_RED", "cust-a-reads-foreign-ticket-attachment", "Customer A can download another customer's Care attachment", {
          roleA: CUST_A.email,
          roleB: foreign.customerEmail,
          steps: [`GET /api/tickets/${foreign.id}/attachments/${stored}`],
          expected: "403 or 404",
          actual: String(dl.status),
          urls: [`GET /api/tickets/${foreign.id}/attachments/${stored}`],
          response: snippet(dl.json),
        });
      }
      cover("customer", "foreign ticket attachment", dl.status === 403 || dl.status === 404 ? "ok" : "fail", `${dl.status}`);
    } else {
      cover("customer", "foreign ticket attachment", "skip", "no attachment on foreign ticket");
    }
  }

  const aCare = await api(custA, "GET", "/api/machines/palletizer/care");
  const aRecent = aCare.json.recentTickets || [];
  const aRecentForeign = aRecent.filter((t) => t.customerEmail && t.customerEmail !== CUST_A.email);
  cover("customer", "care overview A", aCare.status === 200 ? "ok" : "fail", `recent=${aRecent.length}`);
  if (aRecentForeign.length) {
    find("CODE_RED", "cust-a-care-overview-foreign", "Customer A care overview lists other customers' tickets", {
      roleA: CUST_A.email,
      roleB: [...new Set(aRecentForeign.map((t) => t.customerEmail))].join(","),
      steps: ["GET /api/machines/palletizer/care"],
      expected: "only own tickets, or tickets scoped to A",
      actual: snippet(aRecentForeign.map((t) => ({ id: t.id, email: t.customerEmail, title: t.title }))),
      urls: ["GET /api/machines/palletizer/care"],
      response: snippet(aCare.json),
    });
  }

  const bCare = await api(custB, "GET", "/api/machines/palletizer/care");
  const bRecent = bCare.json.recentTickets || [];
  const bSeesA = bRecent.filter((t) => t.customerEmail === CUST_A.email);
  cover("customer", "care overview B", bCare.status === 200 ? "ok" : "fail", `recent=${bRecent.length}`);
  if (bSeesA.length) {
    find("CODE_RED", "cust-b-care-overview-sees-a", "Customer B care overview lists Customer A's tickets", {
      roleA: CUST_A.email,
      roleB: CUST_B.email,
      steps: ["GET /api/machines/palletizer/care as B"],
      expected: "B does not see A's tickets",
      actual: snippet(bSeesA.map((t) => ({ id: t.id, number: t.number, title: t.title }))),
      urls: ["GET /api/machines/palletizer/care"],
      response: snippet(bCare.json),
    });
  }

  const bMachineTickets = await api(custB, "GET", "/api/machines/palletizer/tickets");
  const bMachineList = bMachineTickets.json.tickets || [];
  const bMachineSeesA = bMachineList.filter((t) => t.customerEmail === CUST_A.email);
  cover("customer", "machine tickets B", bMachineTickets.status === 200 ? "ok" : "fail", `n=${bMachineList.length}`);
  if (bMachineSeesA.length) {
    find("CODE_RED", "cust-b-machine-tickets-see-a", "Customer B machine ticket list includes Customer A's tickets", {
      roleA: CUST_A.email,
      roleB: CUST_B.email,
      steps: ["GET /api/machines/palletizer/tickets as B"],
      expected: "only B's tickets",
      actual: snippet(bMachineSeesA.map((t) => ({ id: t.id, email: t.customerEmail }))),
      urls: ["GET /api/machines/palletizer/tickets"],
      response: snippet(bMachineTickets.json),
    });
  }

  const bHwFile = await api(custB, "GET", "/api/machines/hardware-fixture/file");
  cover("customer", "machine file B→hardware-fixture", bHwFile.status === 404 || bHwFile.status === 403 ? "ok" : "fail", `${bHwFile.status}`);
  if (bHwFile.status === 200) {
    find("CODE_RED", "cust-b-file-unassigned", "Customer B can download Hardware fixture model", {
      roleA: CUST_B.email,
      steps: ["GET /api/machines/hardware-fixture/file"],
      expected: "404",
      actual: String(bHwFile.status),
      urls: ["GET /api/machines/hardware-fixture/file"],
    });
  }

  const aHwFile = await api(custA, "GET", "/api/machines/hardware-fixture/file");
  cover("customer", "machine file A hardware-fixture", aHwFile.status === 200 || aHwFile.status === 307 ? "ok" : "fail", `${aHwFile.status}`);

  const bManuals = await api(custB, "GET", "/api/machines/hardware-fixture/manuals");
  cover("customer", "manuals B→hardware-fixture", bManuals.status === 404 || bManuals.status === 403 ? "ok" : "fail", `${bManuals.status}`);
  if (bManuals.status === 200) {
    find("CODE_RED", "cust-b-manuals-unassigned", "Customer B can list Hardware fixture manuals", {
      roleA: CUST_B.email,
      steps: ["GET /api/machines/hardware-fixture/manuals"],
      expected: "404",
      actual: `${bManuals.status} ${snippet(bManuals.json)}`,
      urls: ["GET /api/machines/hardware-fixture/manuals"],
      response: snippet(bManuals.json),
    });
  }

  const aManuals = await api(custA, "GET", "/api/machines/palletizer/manuals");
  cover("customer", "manuals A palletizer", aManuals.status === 200 ? "ok" : "fail", `${aManuals.status}`);

  expectDenied(await api(custA, "GET", "/api/machines/palletizer/usage"), "customer", "GET usage", "GET /api/machines/palletizer/usage");
  expectDenied(await api(custA, "POST", "/api/machines/palletizer/pack", {}), "customer", "POST pack", "POST /api/machines/palletizer/pack");
  expectDenied(await api(custA, "GET", "/api/machines/model-upload"), "customer", "GET model-upload", "GET /api/machines/model-upload");
  expectDenied(await api(custA, "GET", "/api/staff/tickets"), "customer", "GET staff tickets", "GET /api/staff/tickets");
  expectDenied(await api(custA, "GET", "/api/staff/accounts"), "customer", "GET accounts", "GET /api/staff/accounts");
  expectDenied(await api(custA, "GET", "/api/staff/sites"), "customer", "GET sites", "GET /api/staff/sites");
  expectDenied(await api(custA, "GET", "/api/bugs"), "customer", "GET bugs", "GET /api/bugs");
  expectDenied(await api(custA, "GET", "/api/platform/staff"), "customer", "GET platform staff", "GET /api/platform/staff");
  expectDenied(await api(custA, "GET", "/api/platform/deployments"), "customer", "GET deployments", "GET /api/platform/deployments");
  expectDenied(await api(custA, "POST", "/api/staff/machines/backfill-models"), "customer", "POST backfill", "POST /api/staff/machines/backfill-models");
  expectDenied(await api(custA, "PATCH", "/api/tickets/5", { status: "closed" }), "customer", "PATCH ticket status", "PATCH /api/tickets/5");

  const staffUsageGet = await api(staff, "GET", "/api/machines/palletizer/usage");
  cover("staff", "GET usage", staffUsageGet.status === 200 ? "ok" : "fail", `${staffUsageGet.status}`);
  const staffUsagePatch = await api(staff, "PATCH", "/api/machines/palletizer/usage", {
    notes: "Crawl service note 2026-09-16. Invented hours stay unset.",
  });
  cover("staff", "PATCH usage notes", staffUsagePatch.status === 200 ? "ok" : "fail", `${staffUsagePatch.status}`);

  const staffTickets = await api(staff, "GET", "/api/staff/tickets");
  cover("staff", "list staff tickets", staffTickets.status === 200 ? "ok" : "fail", `n=${(staffTickets.json.tickets || []).length}`);

  const staffTeam = await api(staff, "GET", "/api/staff/team");
  cover("staff", "list team", staffTeam.status === 200 ? "ok" : "fail", `n=${(staffTeam.json.staff || []).length}`);

  const staffAccounts = await api(staff, "GET", "/api/staff/accounts");
  const accounts = staffAccounts.json.accounts || [];
  cover("staff", "list accounts", staffAccounts.status === 200 ? "ok" : "fail", `n=${accounts.length}`);
  if (accounts[0]?.id) {
    const one = await api(staff, "GET", `/api/staff/accounts/${accounts[0].id}`);
    cover("staff", "get account", one.status === 200 ? "ok" : "fail", `${one.status}`);
  }

  const staffSites = await api(staff, "GET", "/api/staff/sites");
  cover("staff", "list sites", staffSites.status === 200 ? "ok" : "fail", `n=${(staffSites.json.sites || []).length}`);

  const staffCustomers = await api(staff, "GET", "/api/staff/customers");
  const people = staffCustomers.json.customers || [];
  cover("staff", "list people", staffCustomers.status === 200 ? "ok" : "fail", `n=${people.length}`);
  const personA = people.find((p) => p.email === CUST_A.email);
  const personB = people.find((p) => p.email === CUST_B.email);
  if (personA?.id) {
    const patchA = await api(staff, "PATCH", `/api/staff/customers/${personA.id}`, {
      name: "Crawl Hunt A",
    });
    cover("staff", "directory PATCH A", patchA.status === 200 ? "ok" : "fail", `${patchA.status}`);
  }
  if (personB?.id) {
    const patchB = await api(staff, "PATCH", `/api/staff/customers/${personB.id}`, {
      name: "Crawl Hunt B",
    });
    cover("staff", "directory PATCH B", patchB.status === 200 ? "ok" : "fail", `${patchB.status}`);
  }

  const throwEmail = "crawl-wide-person-20260916@spares.test";
  const throwPass = "CrawlWide!20260916";
  const created = await api(staff, "POST", "/api/staff/customers", {
    email: throwEmail,
    password: throwPass,
    name: "Crawl Wide Person",
    siteIds: [],
    machineIds: [],
  });
  cover("staff", "create person", created.status === 201 || created.status === 409 ? "ok" : "fail", `${created.status}`);
  let throwId = created.json.user?.id;
  if (!throwId) {
    const again = await api(staff, "GET", "/api/staff/customers");
    throwId = (again.json.customers || []).find((p) => p.email === throwEmail)?.id;
  }
  if (throwId) {
    const del = await api(staff, "DELETE", `/api/staff/customers/${throwId}`);
    cover("staff", "soft-delete person", del.status === 200 ? "ok" : "fail", `${del.status}`);
    const deadLogin = await login(throwEmail, throwPass);
    cover("customer", "login after soft-delete", deadLogin.status === 401 || deadLogin.status === 403 ? "ok" : "fail", `${deadLogin.status}`);
    if (deadLogin.status === 200) {
      find("CODE_RED", "soft-delete-login", "Soft-deleted person can still sign in", {
        roleA: throwEmail,
        steps: ["DELETE /api/staff/customers/:id", "POST /api/auth/login"],
        expected: "401",
        actual: String(deadLogin.status),
        urls: ["POST /api/auth/login"],
      });
    }
  }

  const missingDel = await api(staff, "DELETE", "/api/staff/customers/not-a-real-person-id");
  cover("staff", "delete missing person", missingDel.status === 404 ? "ok" : "fail", `${missingDel.status}`);

  cover("staff", "delete protected demo", "skip", "not attempted");

  const staffQuotes = await api(staff, "GET", "/api/quotes");
  const quotes = staffQuotes.json.quotes || [];
  cover("staff", "list quotes", staffQuotes.status === 200 ? "ok" : "fail", `n=${quotes.length}`);
  const quote3 = quotes.find((q) => q.number === 3) || quotes.find((q) => q.status === "requested");
  if (quote3) {
    const [p1, p2] = await Promise.all([
      api(staff, "PATCH", `/api/quotes/${quote3.id}`, { status: "in_review" }),
      api(staff, "PATCH", `/api/quotes/${quote3.id}`, { status: "pricing" }),
    ]);
    cover("staff", "concurrent quote PATCH", p1.status === 200 && p2.status === 200 ? "ok" : "fail", `${p1.status}/${p2.status}`);
    const after = await api(staff, "GET", `/api/quotes/${quote3.id}`);
    cover("staff", "quote after concurrent write", after.status === 200 ? "ok" : "fail", after.json.quote?.status);
  }

  const invoice = await api(staff, "PATCH", "/api/quotes/2", { invoiceNumber: "INV-CRAWL-WIDE-16" });
  const invoiceGet = await api(staff, "GET", "/api/quotes/2");
  const invoiceCust = await api(custA, "GET", "/api/quotes/2");
  const hasInv = Boolean(invoiceGet.json.quote?.invoiceNumber);
  cover("staff", "invoice persist after PATCH", hasInv ? "ok" : "fail", invoiceGet.json.quote?.invoiceNumber || "omitted");
  if (invoice.status === 200 && !hasInv) {
    find("major", "invoice-still-dropped", "Invoice number still omitted after PATCH 200", {
      roleA: STAFF.email,
      steps: ["PATCH /api/quotes/2 invoiceNumber", "GET /api/quotes/2"],
      expected: "INV-CRAWL-WIDE-16",
      actual: snippet({ staff: invoiceGet.json.quote, customer: invoiceCust.json.quote }),
      urls: ["PATCH /api/quotes/2", "GET /api/quotes/2"],
      response: snippet(invoiceGet.json.quote),
    });
  }

  const aQuote2 = await api(custA, "GET", "/api/quotes/2");
  const aAtt = (aQuote2.json.quote?.activities || []).flatMap((act) => act.attachments || []);
  if (aAtt[0]?.r2Key) {
    const stored = aAtt[0].r2Key.replace(/^chat\//, "");
    const bDl = await api(custB, "GET", `/api/quotes/${aQuote2.json.quote.id}/attachments/${stored}`);
    cover("customer", "quote attachment B→A", bDl.status === 403 || bDl.status === 404 ? "ok" : "fail", `${bDl.status}`);
    if (bDl.status === 200) {
      find("CODE_RED", "cust-b-quote-attachment", "Customer B can download Customer A's quote attachment", {
        roleA: CUST_A.email,
        roleB: CUST_B.email,
        steps: [`GET /api/quotes/${aQuote2.json.quote.id}/attachments/${stored}`],
        expected: "403 or 404",
        actual: String(bDl.status),
        urls: [`GET /api/quotes/${aQuote2.json.quote.id}/attachments/${stored}`],
      });
    }
  } else {
    cover("customer", "quote attachment B→A", "skip", "no attachment on quote 2");
  }

  const staffBugs = await api(staff, "GET", "/api/bugs");
  cover("staff", "list bugs", staffBugs.status === 200 ? "ok" : "fail", `n=${(staffBugs.json.reports || []).length}`);

  const staffUpload = await api(staff, "GET", "/api/machines/model-upload");
  cover("staff", "GET model-upload", staffUpload.status === 200 ? "ok" : "fail", snippet(staffUpload.json));

  const platStaff = await api(staff, "GET", "/api/platform/staff");
  cover("platform", "host staff GET platform staff", platStaff.status === 403 ? "ok" : "fail", `${platStaff.status}`);
  if (platStaff.status === 200) {
    find("CODE_RED", "staff-platform-staff", "Host staff can list platform staff", {
      roleA: STAFF.email,
      steps: ["GET /api/platform/staff"],
      expected: "403",
      actual: `${platStaff.status} ${snippet(platStaff.json)}`,
      urls: ["GET /api/platform/staff"],
      response: snippet(platStaff.json),
    });
  }

  const platDep = await api(staff, "GET", "/api/platform/deployments");
  cover("platform", "host staff GET deployments", platDep.status === 403 ? "ok" : "fail", `${platDep.status}`);
  if (platDep.status === 200) {
    find("CODE_RED", "staff-platform-deployments", "Host staff can list platform deployments", {
      roleA: STAFF.email,
      steps: ["GET /api/platform/deployments"],
      expected: "403",
      actual: `${platDep.status} ${snippet(platDep.json)}`,
      urls: ["GET /api/platform/deployments"],
      response: snippet(platDep.json),
    });
  }

  const platUser = aUserId
    ? await api(staff, "GET", `/api/platform/directory/users/${aUserId}`)
    : { status: 0, json: {} };
  cover("platform", "host staff GET platform directory user", platUser.status === 403 || platUser.status === 401 ? "ok" : "fail", `${platUser.status}`);
  if (platUser.status === 200) {
    find("CODE_RED", "staff-platform-user", "Host staff can read platform directory person", {
      roleA: STAFF.email,
      steps: [`GET /api/platform/directory/users/${aUserId}`],
      expected: "403",
      actual: `${platUser.status} ${snippet(platUser.json)}`,
      urls: [`GET /api/platform/directory/users/${aUserId}`],
      response: snippet(platUser.json),
    });
  }

  const views = await api(staff, "GET", "/api/staff/machines/palletizer/views");
  cover("staff", "machine views", views.status === 200 || views.status === 404 || views.status === 405 ? "ok" : "fail", `${views.status}`);

  const fixture = await api(staff, "POST", "/api/staff/quotes/preview-fixture", {});
  cover("staff", "preview fixture", fixture.status === 200 || fixture.status === 201 || fixture.status === 409 || fixture.status === 403 ? "ok" : "fail", `${fixture.status}`);

  const staff2 = await login("crawl-20260916-staff@spares.test", process.env.OEE360_STAFF2_PASSWORD || "");
  if (staff2.status === 200) {
    cover("staff", "second staff login", "ok", "crawl-20260916-staff@spares.test");
    const s2plat = await api(staff2, "GET", "/api/platform/tenants");
    cover("staff", "second staff platform tenants", s2plat.status === 403 ? "ok" : "fail", `${s2plat.status}`);
  } else {
    cover("staff", "second staff login", "skip", `${staff2.status}`);
  }

  const aMsg = await api(custA, "POST", `/api/tickets/${aOwn?.id || "5"}/activity`, {
    text: "Customer A wide crawl. Palletizer still waits on the invented $12.50 bearing quote.",
  });
  cover("customer", "care reply A", aMsg.status === 201 ? "ok" : "fail", `${aMsg.status}`);
  const sMsg = await api(staff, "POST", `/api/tickets/${aOwn?.id || "5"}/activity`, {
    text: "Staff wide crawl. Bearing stays $12.50, motor $340. Visit note logged.",
  });
  cover("staff", "care reply staff", sMsg.status === 201 ? "ok" : "fail", `${sMsg.status}`);

  const q3id = quote3?.id;
  if (q3id) {
    await api(custA, "POST", `/api/quotes/${q3id}/activity`, {
      text: "Customer A on quote 3. Need a price on the second tray request.",
    });
    await api(staff, "POST", `/api/quotes/${q3id}/activity`, {
      text: "Staff on quote 3. Invented line prices $18.75 and $210. Freight $40 in a note.",
    });
    const priced = await api(staff, "PATCH", `/api/quotes/${q3id}`, {
      status: "quoted",
      items: [
        { id: "5972K325", qty: 1, sellPrice: 18.75, supplierCost: 6 },
        { id: "6331K32", qty: 1, sellPrice: 210, supplierCost: 120, note: "freight $40 invent" },
      ],
    });
    cover("staff", "price quote 3", priced.status === 200 ? "ok" : "fail", `${priced.status}`);
    const aSees = await api(custA, "GET", `/api/quotes/${q3id}`);
    const items = aSees.json.quote?.items || [];
    const saw = items.some((i) => i.sellPrice != null);
    cover("customer", "quote 3 prices after quoted", saw ? "ok" : "fail", aSees.json.quote?.status);
  }

  const logout = await api(custA, "POST", "/api/auth/logout");
  const after = await api(custA, "GET", "/api/auth/me");
  cover("customer", "logout then me", after.status === 401 ? "ok" : "fail", `${logout.status}/${after.status}`);

  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    findingCounts: findings.reduce((acc, f) => {
      acc[f.severity] = (acc[f.severity] || 0) + 1;
      return acc;
    }, {}),
    findings,
    coverage,
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
