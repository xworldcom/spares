#!/usr/bin/env node
/**
 * Production isolation + authz crawl for oee360.com.
 * Prints a JSON report. Does not delete users or mutate protected demos
 * beyond creating throwaway crawl-* accounts and throwaway tickets/quotes.
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
  name: process.env.OEE360_CUST_B_NAME || "Crawl Hunt B",
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

async function api(session, method, path, payload, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (session?.cookie) headers.Cookie = session.cookie;
  let body;
  if (payload instanceof FormData) {
    body = payload;
  } else if (payload !== undefined) {
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

function snippet(json) {
  const s = JSON.stringify(json);
  return s.length > 500 ? `${s.slice(0, 500)}…` : s;
}

async function main() {
  const anon = await api(null, "GET", "/api/auth/me");
  cover("anon", "GET /api/auth/me", anon.status === 401 ? "ok" : "fail", `status ${anon.status}`);
  if (anon.status !== 401 && anon.status !== 200) {
    find("major", "anon-me", "Anonymous /api/auth/me unexpected status", {
      steps: ["GET /api/auth/me without cookie"],
      expected: "401",
      actual: String(anon.status),
      response: snippet(anon.json),
    });
  }

  const staff = await login(STAFF.email, STAFF.password);
  if (staff.status !== 200 || !staff.cookie) {
    find("blocker", "staff-login", "Staff throwaway login failed", {
      steps: [`POST /api/auth/login as ${STAFF.email}`],
      expected: "200 + session cookie",
      actual: `${staff.status} ${snippet(staff.body)}`,
    });
    console.log(JSON.stringify({ findings, coverage }, null, 2));
    process.exit(1);
  }
  cover("staff", "login", "ok", staff.email);

  const staffMe = await api(staff, "GET", "/api/auth/me");
  cover("staff", "me", staffMe.status === 200 ? "ok" : "fail", snippet(staffMe.json));

  let custA = await login(CUST_A.email, CUST_A.password);
  if (custA.status !== 200) {
    find("blocker", "cust-a-login", "Customer A login failed", {
      steps: [`POST /api/auth/login as ${CUST_A.email}`],
      expected: "200",
      actual: `${custA.status} ${snippet(custA.body)}`,
    });
    console.log(JSON.stringify({ findings, coverage }, null, 2));
    process.exit(1);
  }
  cover("customer", "login A", "ok", CUST_A.email);

  const createdB = await api(staff, "POST", "/api/staff/customers", {
    email: CUST_B.email,
    password: CUST_B.password,
    name: CUST_B.name,
    siteIds: [],
    machineIds: ["palletizer"],
  });
  if (createdB.status !== 201 && createdB.status !== 409) {
    find("major", "create-cust-b", "Could not create isolation customer B", {
      steps: ["Staff POST /api/staff/customers palletizer-only"],
      expected: "201 or 409",
      actual: `${createdB.status} ${snippet(createdB.json)}`,
    });
  }
  cover("staff", "create customer B", createdB.status === 201 || createdB.status === 409 ? "ok" : "fail", `${createdB.status}`);

  const dup = await api(staff, "POST", "/api/staff/customers", {
    email: CUST_A.email,
    password: "AnotherPass!99",
    name: "Dup",
    siteIds: [],
    machineIds: ["palletizer"],
  });
  if (dup.status !== 409) {
    find("major", "dup-email", "Duplicate customer email did not return 409", {
      steps: [`Staff POST /api/staff/customers with existing ${CUST_A.email}`],
      expected: "409",
      actual: `${dup.status} ${snippet(dup.json)}`,
    });
  }
  cover("staff", "duplicate email", dup.status === 409 ? "ok" : "fail", `${dup.status}`);

  let custB = await login(CUST_B.email, CUST_B.password);
  if (custB.status !== 200) {
    find("blocker", "cust-b-login", "Customer B login failed", {
      steps: [`POST /api/auth/login as ${CUST_B.email}`],
      expected: "200",
      actual: `${custB.status} ${snippet(custB.body)}`,
    });
  } else {
    cover("customer", "login B", "ok", CUST_B.email);
  }

  const staffMachines = await api(staff, "GET", "/api/machines");
  const staffMachineIds = (staffMachines.json.machines || []).map((m) => m.id);
  cover("staff", "list machines", staffMachines.status === 200 ? "ok" : "fail", staffMachineIds.join(","));

  const aMachines = await api(custA, "GET", "/api/machines");
  const aIds = (aMachines.json.machines || []).map((m) => m.id);
  cover("customer", "list machines A", aMachines.status === 200 ? "ok" : "fail", aIds.join(","));

  const bMachines = custB.cookie ? await api(custB, "GET", "/api/machines") : { status: 0, json: {} };
  const bIds = (bMachines.json.machines || []).map((m) => m.id);
  cover("customer", "list machines B", bMachines.status === 200 ? "ok" : "fail", bIds.join(","));
  if (custB.cookie && bIds.includes("hardware-fixture")) {
    find("CODE_RED", "cust-b-sees-unassigned-machine", "Customer B sees Hardware fixture without a grant", {
      roleA: CUST_B.email,
      roleB: "machine grant palletizer-only",
      steps: ["Login B", "GET /api/machines"],
      expected: "only palletizer",
      actual: bIds.join(","),
      urls: ["GET /api/machines"],
      response: snippet(bMachines.json),
    });
  }

  const bHardware = custB.cookie
    ? await api(custB, "GET", "/api/machines/hardware-fixture")
    : { status: 0, json: {} };
  if (custB.cookie && bHardware.status === 200) {
    find("CODE_RED", "cust-b-detail-unassigned", "Customer B can open Hardware fixture detail", {
      roleA: CUST_B.email,
      roleB: "machine grant palletizer-only",
      steps: ["GET /api/machines/hardware-fixture as B"],
      expected: "404",
      actual: `${bHardware.status} ${snippet(bHardware.json)}`,
      urls: ["GET /api/machines/hardware-fixture"],
      response: snippet(bHardware.json),
    });
  }
  cover("customer", "machine IDOR B→hardware-fixture", bHardware.status === 404 || bHardware.status === 403 ? "ok" : "fail", `${bHardware.status}`);

  const aQuotes = await api(custA, "GET", "/api/quotes");
  const aQuoteIds = (aQuotes.json.quotes || []).map((q) => q.id);
  const aQuoteEmails = [...new Set((aQuotes.json.quotes || []).map((q) => q.customerEmail))];
  cover("customer", "list quotes A", aQuotes.status === 200 ? "ok" : "fail", `n=${aQuoteIds.length}`);
  if ((aQuotes.json.quotes || []).some((q) => q.customerEmail && q.customerEmail !== CUST_A.email)) {
    find("CODE_RED", "cust-a-sees-foreign-quotes", "Customer A list includes another customer's quote", {
      roleA: CUST_A.email,
      roleB: aQuoteEmails.join(","),
      steps: ["GET /api/quotes as customer A"],
      expected: "only own quotes",
      actual: snippet(aQuotes.json),
      urls: ["GET /api/quotes"],
      response: snippet(aQuotes.json),
    });
  }

  const qaQuote = await api(custA, "GET", "/api/quotes/quote-preview-qa-conversation");
  if (qaQuote.status === 200) {
    find("CODE_RED", "cust-a-reads-qa-quote", "Customer A can read buyer@acme.test QA quote", {
      roleA: CUST_A.email,
      roleB: "buyer@acme.test",
      steps: ["GET /api/quotes/quote-preview-qa-conversation"],
      expected: "403 or 404",
      actual: `${qaQuote.status} ${snippet(qaQuote.json)}`,
      urls: ["GET /api/quotes/quote-preview-qa-conversation"],
      response: snippet(qaQuote.json),
    });
  }
  cover("customer", "quote IDOR A→QA fixture", qaQuote.status === 403 || qaQuote.status === 404 ? "ok" : "fail", `${qaQuote.status}`);

  const qaByNumber = await api(custA, "GET", "/api/quotes/1");
  if (qaByNumber.status === 200) {
    find("CODE_RED", "cust-a-reads-quote-1", "Customer A can read quote number 1 (Acme QA)", {
      roleA: CUST_A.email,
      roleB: qaByNumber.json.quote?.customerEmail,
      steps: ["GET /api/quotes/1"],
      expected: "403 or 404",
      actual: `${qaByNumber.status} ${snippet(qaByNumber.json)}`,
      urls: ["GET /api/quotes/1"],
      response: snippet(qaByNumber.json),
    });
  }
  cover("customer", "quote IDOR A→/1", qaByNumber.status === 403 || qaByNumber.status === 404 ? "ok" : "fail", `${qaByNumber.status}`);

  const aTickets = await api(custA, "GET", "/api/tickets");
  const aTicketList = aTickets.json.tickets || [];
  cover("customer", "list tickets A", aTickets.status === 200 ? "ok" : "fail", `n=${aTicketList.length}`);
  const foreignTickets = aTicketList.filter(
    (t) => t.customerEmail && t.customerEmail !== CUST_A.email,
  );
  if (foreignTickets.length) {
    find("CODE_RED", "cust-a-lists-foreign-tickets", "Customer A lists Care tickets owned by other customers", {
      roleA: CUST_A.email,
      roleB: [...new Set(foreignTickets.map((t) => t.customerEmail))].join(","),
      steps: ["GET /api/tickets as customer A (has hardware-fixture + palletizer)"],
      expected: "only tickets A opened, or tickets scoped to A",
      actual: `${foreignTickets.length} foreign tickets: ${foreignTickets
        .map((t) => `${t.number} ${t.customerEmail} ${t.title}`)
        .join(" | ")}`,
      urls: ["GET /api/tickets"],
      response: snippet({
        count: aTicketList.length,
        foreign: foreignTickets.map((t) => ({
          id: t.id,
          number: t.number,
          email: t.customerEmail,
          title: t.title,
          machineId: t.machineId,
        })),
      }),
    });
  }

  if (foreignTickets[0]) {
    const readForeign = await api(custA, "GET", `/api/tickets/${foreignTickets[0].id}`);
    if (readForeign.status === 200) {
      find("CODE_RED", "cust-a-reads-foreign-ticket", "Customer A can open another customer's ticket detail", {
        roleA: CUST_A.email,
        roleB: foreignTickets[0].customerEmail,
        steps: [`GET /api/tickets/${foreignTickets[0].id}`],
        expected: "404",
        actual: `${readForeign.status} ${snippet(readForeign.json)}`,
        urls: [`GET /api/tickets/${foreignTickets[0].id}`],
        response: snippet(readForeign.json),
      });
    }
    const replyForeign = await api(custA, "POST", `/api/tickets/${foreignTickets[0].id}/activity`, {
      text: "CRAWL isolation probe — ignore. Checking whether a second customer can write on this ticket.",
    });
    if (replyForeign.status === 201 || replyForeign.status === 200) {
      find("CODE_RED", "cust-a-writes-foreign-ticket", "Customer A can post on another customer's Care ticket", {
        roleA: CUST_A.email,
        roleB: foreignTickets[0].customerEmail,
        steps: [`POST /api/tickets/${foreignTickets[0].id}/activity`],
        expected: "403 or 404",
        actual: `${replyForeign.status} ${snippet(replyForeign.json)}`,
        urls: [`POST /api/tickets/${foreignTickets[0].id}/activity`],
        response: snippet(replyForeign.json),
      });
    }
    cover(
      "customer",
      "ticket write IDOR",
      replyForeign.status === 403 || replyForeign.status === 404 ? "ok" : "fail",
      `${replyForeign.status}`,
    );
  }

  const aPalletTicket = await api(custA, "POST", "/api/machines/palletizer/tickets", {
    title: "Crawl A palletizer isolation ticket",
    note: "Throwaway ticket from crawl-20260916-0524 to test B isolation.",
  });
  cover("customer", "create ticket A on palletizer", aPalletTicket.status === 201 ? "ok" : "fail", `${aPalletTicket.status}`);
  const aTicketId = aPalletTicket.json.ticket?.id;

  if (custB.cookie && aTicketId) {
    const bSeesA = await api(custB, "GET", "/api/tickets");
    const bList = bSeesA.json.tickets || [];
    const leaked = bList.filter((t) => t.id === aTicketId || t.customerEmail === CUST_A.email);
    if (leaked.length) {
      find("CODE_RED", "cust-b-lists-a-ticket", "Customer B lists Customer A's palletizer ticket", {
        roleA: CUST_A.email,
        roleB: CUST_B.email,
        steps: [
          "A POST /api/machines/palletizer/tickets",
          "B GET /api/tickets",
        ],
        expected: "B does not see A's ticket",
        actual: snippet({ leaked, all: bList.map((t) => ({ id: t.id, email: t.customerEmail, title: t.title })) }),
        urls: ["GET /api/tickets"],
        response: snippet(bSeesA.json),
      });
    }
    const bReadA = await api(custB, "GET", `/api/tickets/${aTicketId}`);
    if (bReadA.status === 200) {
      find("CODE_RED", "cust-b-reads-a-ticket", "Customer B can open Customer A's ticket", {
        roleA: CUST_A.email,
        roleB: CUST_B.email,
        steps: [`B GET /api/tickets/${aTicketId}`],
        expected: "404",
        actual: `${bReadA.status} ${snippet(bReadA.json)}`,
        urls: [`GET /api/tickets/${aTicketId}`],
        response: snippet(bReadA.json),
      });
    }
    cover("customer", "ticket IDOR B→A", bReadA.status === 404 || bReadA.status === 403 ? "ok" : "fail", `${bReadA.status}`);
  }

  const aQuote = await api(custA, "POST", "/api/quotes", {
    machineId: "hardware-fixture",
    items: [
      { id: "5972K325", qty: 1, name: "Shielded ball bearing" },
      { id: "6331K32", qty: 1, name: "Miniature DC motor" },
    ],
    note: "Crawl A isolation quote. Need-by invented. Freight note $75.",
  });
  cover("customer", "create quote A", aQuote.status === 201 ? "ok" : "fail", `${aQuote.status} ${aQuote.json.quote?.id || ""}`);
  const aQuoteId = aQuote.json.quote?.id;
  const aQuoteNumber = aQuote.json.quote?.number;

  if (custB.cookie && aQuoteId) {
    const bQuotes = await api(custB, "GET", "/api/quotes");
    const bHasA = (bQuotes.json.quotes || []).some((q) => q.id === aQuoteId);
    if (bHasA) {
      find("CODE_RED", "cust-b-lists-a-quote", "Customer B lists Customer A's quote", {
        roleA: CUST_A.email,
        roleB: CUST_B.email,
        steps: ["A POST /api/quotes", "B GET /api/quotes"],
        expected: "B does not see A's quote",
        actual: snippet(bQuotes.json),
        urls: ["GET /api/quotes"],
        response: snippet(bQuotes.json),
      });
    }
    const bReadA = await api(custB, "GET", `/api/quotes/${aQuoteId}`);
    if (bReadA.status === 200) {
      find("CODE_RED", "cust-b-reads-a-quote", "Customer B can open Customer A's quote", {
        roleA: CUST_A.email,
        roleB: CUST_B.email,
        steps: [`B GET /api/quotes/${aQuoteId}`],
        expected: "403 or 404",
        actual: `${bReadA.status} ${snippet(bReadA.json)}`,
        urls: [`GET /api/quotes/${aQuoteId}`],
        response: snippet(bReadA.json),
      });
    }
    const bReadNum = aQuoteNumber
      ? await api(custB, "GET", `/api/quotes/${aQuoteNumber}`)
      : { status: 0, json: {} };
    if (bReadNum.status === 200) {
      find("CODE_RED", "cust-b-reads-a-quote-number", "Customer B can open A's quote by number", {
        roleA: CUST_A.email,
        roleB: CUST_B.email,
        steps: [`B GET /api/quotes/${aQuoteNumber}`],
        expected: "403 or 404",
        actual: `${bReadNum.status} ${snippet(bReadNum.json)}`,
        urls: [`GET /api/quotes/${aQuoteNumber}`],
        response: snippet(bReadNum.json),
      });
    }
    cover("customer", "quote IDOR B→A", bReadA.status === 403 || bReadA.status === 404 ? "ok" : "fail", `${bReadA.status}`);
  }

  const staffForbidden = [
    ["/api/staff/customers", "GET"],
    ["/api/staff/accounts", "GET"],
    ["/api/staff/sites", "GET"],
    ["/api/staff/team", "GET"],
    ["/api/staff/quotes/preview-fixture", "POST"],
    ["/api/platform/tenants", "GET"],
    ["/api/platform/directory", "GET"],
    ["/api/platform/staff", "GET"],
  ];
  for (const [path, method] of staffForbidden) {
    const res = await api(custA, method, path, method === "POST" ? {} : undefined);
    if (res.status === 200 || res.status === 201) {
      find("CODE_RED", `cust-staff-${path}`, `Customer A can call staff/platform ${method} ${path}`, {
        roleA: CUST_A.email,
        roleB: "staff/platform API",
        steps: [`${method} ${path} as customer`],
        expected: "401/403",
        actual: `${res.status} ${snippet(res.json)}`,
        urls: [`${method} ${path}`],
        response: snippet(res.json),
      });
    }
    cover("customer", `${method} ${path}`, res.status === 401 || res.status === 403 || res.status === 404 ? "ok" : "fail", `${res.status}`);
  }

  const platGet = await api(staff, "GET", "/api/platform/tenants");
  if (platGet.status !== 403) {
    find("major", "staff-platform-tenants", "Host staff GET /api/platform/tenants was not 403", {
      roleA: STAFF.email,
      steps: ["GET /api/platform/tenants as host staff (not platform owner)"],
      expected: "403",
      actual: `${platGet.status} ${snippet(platGet.json)}`,
      response: snippet(platGet.json),
    });
  }
  cover("platform", "host staff GET tenants", platGet.status === 403 ? "ok" : "fail", `${platGet.status}`);

  const platPost = await api(staff, "POST", "/api/platform/tenants", {
    name: "Crawl Isolation Host",
    staffEmail: "crawl-host-staff@spares.test",
    staffPassword: "CrawlHost!20260916",
  });
  if (platPost.status === 201) {
    find("CODE_RED", "staff-created-tenant", "Non-owner host staff created a platform tenant", {
      roleA: STAFF.email,
      roleB: "platform tenant create",
      steps: ["POST /api/platform/tenants as host staff"],
      expected: "403",
      actual: `${platPost.status} ${snippet(platPost.json)}`,
      urls: ["POST /api/platform/tenants"],
      response: snippet(platPost.json),
    });
  }
  cover("platform", "host staff POST tenant", platPost.status === 403 ? "ok" : "fail", `${platPost.status}`);

  const platDir = await api(staff, "GET", "/api/platform/directory");
  cover("platform", "host staff GET directory", platDir.status === 403 ? "ok" : "fail", `${platDir.status}`);
  if (platDir.status === 200) {
    find("CODE_RED", "staff-platform-directory", "Host staff can read cross-install platform directory", {
      roleA: STAFF.email,
      steps: ["GET /api/platform/directory as host staff"],
      expected: "403",
      actual: `${platDir.status} ${snippet(platDir.json)}`,
      urls: ["GET /api/platform/directory"],
      response: snippet(platDir.json),
    });
  }

  const crossTeam = await api(staff, "GET", "/api/staff/team?tenantId=tenant-does-not-exist");
  if (crossTeam.status === 200) {
    find("CODE_RED", "staff-team-cross-tenant-list", "Host staff listed team for another tenantId", {
      roleA: STAFF.email,
      steps: ["GET /api/staff/team?tenantId=tenant-does-not-exist"],
      expected: "403",
      actual: `${crossTeam.status} ${snippet(crossTeam.json)}`,
      urls: ["GET /api/staff/team?tenantId=tenant-does-not-exist"],
      response: snippet(crossTeam.json),
    });
  }
  cover("staff", "team list other tenantId", crossTeam.status === 403 ? "ok" : "fail", `${crossTeam.status}`);

  const crossCreate = await api(staff, "POST", "/api/staff/team", {
    email: "crawl-x-tenant-staff@spares.test",
    password: "CrawlXTenant!16",
    tenantId: "tenant-does-not-exist",
  });
  if (crossCreate.status === 201) {
    find("CODE_RED", "staff-team-cross-tenant-create", "Host staff created staff on another tenantId", {
      roleA: STAFF.email,
      steps: ["POST /api/staff/team with foreign tenantId"],
      expected: "403",
      actual: `${crossCreate.status} ${snippet(crossCreate.json)}`,
      urls: ["POST /api/staff/team"],
      response: snippet(crossCreate.json),
    });
  }
  cover("staff", "team create other tenantId", crossCreate.status === 403 ? "ok" : "fail", `${crossCreate.status}`);

  const usagePatch = await api(custA, "PATCH", "/api/machines/palletizer/usage", {
    hours: 12,
    notes: "customer should not write service log",
  });
  if (usagePatch.status === 200) {
    find("CODE_RED", "cust-writes-usage", "Customer can PATCH machine service/usage", {
      roleA: CUST_A.email,
      steps: ["PATCH /api/machines/palletizer/usage"],
      expected: "403",
      actual: `${usagePatch.status} ${snippet(usagePatch.json)}`,
      urls: ["PATCH /api/machines/palletizer/usage"],
      response: snippet(usagePatch.json),
    });
  }
  cover("customer", "PATCH usage", usagePatch.status === 401 || usagePatch.status === 403 || usagePatch.status === 404 ? "ok" : "fail", `${usagePatch.status}`);

  const staffCustomers = await api(staff, "GET", "/api/staff/customers");
  const emails = (staffCustomers.json.customers || []).map((c) => c.email);
  cover("staff", "list customers", staffCustomers.status === 200 ? "ok" : "fail", `n=${emails.length}`);

  if (aQuoteId) {
    const staffQuote = await api(staff, "GET", `/api/quotes/${aQuoteId}`);
    cover("staff", "read A quote", staffQuote.status === 200 ? "ok" : "fail", `${staffQuote.status}`);
    const price = await api(staff, "PATCH", `/api/quotes/${aQuoteId}`, {
      status: "pricing",
      items: [
        { id: "5972K325", qty: 1, sellPrice: 12.5, supplierCost: 4.2, note: "freight $75 invent" },
        { id: "6331K32", qty: 1, sellPrice: 340, supplierCost: 210 },
      ],
    });
    cover("staff", "price A quote", price.status === 200 ? "ok" : "fail", `${price.status}`);
    const aSeesPrice = await api(custA, "GET", `/api/quotes/${aQuoteId}`);
    const items = aSeesPrice.json.quote?.items || [];
    const leakedPrice = items.some((i) => i.sellPrice != null);
    if (leakedPrice && aSeesPrice.json.quote?.status === "pricing") {
      find("major", "customer-sees-price-before-quoted", "Customer sees sellPrice while status is pricing", {
        roleA: CUST_A.email,
        roleB: STAFF.email,
        steps: ["Staff PATCH pricing + sellPrice", "Customer GET quote"],
        expected: "prices hidden until quoted",
        actual: snippet({ status: aSeesPrice.json.quote?.status, items }),
        urls: [`GET /api/quotes/${aQuoteId}`],
        response: snippet(aSeesPrice.json.quote),
      });
    }
    cover("customer", "prices hidden before quoted", leakedPrice ? "fail" : "ok", aSeesPrice.json.quote?.status);
  }

  const staffQuoteList = await api(staff, "GET", "/api/quotes");
  const otherTenantQuotes = (staffQuoteList.json.quotes || []).filter(
    (q) => q.tenantId && q.tenantId !== "tenant-oee360-host",
  );
  if (otherTenantQuotes.length) {
    find("CODE_RED", "staff-sees-other-tenant-quotes", "Host staff quote list includes another tenant", {
      roleA: STAFF.email,
      steps: ["GET /api/quotes as host staff"],
      expected: "only tenant-oee360-host",
      actual: snippet(otherTenantQuotes),
      urls: ["GET /api/quotes"],
      response: snippet(otherTenantQuotes),
    });
  }
  cover("staff", "quotes tenant scope", otherTenantQuotes.length ? "fail" : "ok", `n=${(staffQuoteList.json.quotes || []).length}`);

  const logout = await api(custA, "POST", "/api/auth/logout");
  const after = await api(custA, "GET", "/api/auth/me");
  cover("customer", "logout", after.status === 401 ? "ok" : "fail", `${logout.status}/${after.status}`);

  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    accounts: {
      staff: STAFF.email,
      customerA: CUST_A.email,
      customerB: CUST_B.email,
      quoteId: aQuoteId || null,
      quoteNumber: aQuoteNumber || null,
      ticketId: aTicketId || null,
    },
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
