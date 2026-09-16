#!/usr/bin/env node
const BASE = process.env.OEE360_BASE_URL || "https://oee360.com";
const QUOTE = process.env.OEE360_QUOTE_ID || "b03fa31d-440f-4845-8b64-a8da371491f1";
const TICKET = process.env.OEE360_TICKET_ID || "ac03a328-b1a4-42ee-860b-a92112f9ab35";
const STAFF = {
  email: process.env.OEE360_STAFF_EMAIL,
  password: process.env.OEE360_STAFF_PASSWORD,
};
const CUST = {
  email: process.env.OEE360_CUST_A_EMAIL,
  password: process.env.OEE360_CUST_A_PASSWORD,
};
if (!STAFF.email || !STAFF.password || !CUST.email || !CUST.password) {
  console.error("Set OEE360_STAFF_EMAIL/PASSWORD and OEE360_CUST_A_EMAIL/PASSWORD");
  process.exit(2);
}

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  const setCookie =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie")].filter(Boolean);
  return {
    status: res.status,
    body,
    cookie: setCookie.map((c) => c.split(";")[0]).join("; "),
  };
}

async function api(session, method, path, payload) {
  const headers = { Cookie: session.cookie };
  let body;
  if (payload !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(payload);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function activitySummary(quote) {
  return (quote?.activities || []).map((a) => ({
    kind: a.kind,
    role: a.actorRole,
    email: a.actorEmail,
    text: (a.text || "").slice(0, 80),
  }));
}

async function main() {
  const staff = await login(STAFF.email, STAFF.password);
  const cust = await login(CUST.email, CUST.password);
  const log = [];

  async function step(name, fn) {
    const result = await fn();
    log.push({ name, status: result.status, excerpt: JSON.stringify(result.json).slice(0, 220) });
    return result;
  }

  await step("cust msg 1", () =>
    api(cust, "POST", `/api/quotes/${QUOTE}/activity`, {
      text: "Customer UI-API 1. Need the bearing this week on the Dayton fixture.",
    }),
  );
  await step("staff msg 1", () =>
    api(staff, "POST", `/api/quotes/${QUOTE}/activity`, {
      text: "Staff 1. In review. Bearing is $12.50, motor $340, freight $75 invented.",
    }),
  );
  await step("cust msg 2", () =>
    api(cust, "POST", `/api/quotes/${QUOTE}/activity`, {
      text: "Customer 2. Those prices work. Can you issue the quote?",
    }),
  );
  await step("staff in_review", () =>
    api(staff, "PATCH", `/api/quotes/${QUOTE}`, { status: "in_review" }),
  );
  await step("staff pricing", () =>
    api(staff, "PATCH", `/api/quotes/${QUOTE}`, {
      status: "pricing",
      items: [
        { id: "5972K325", qty: 1, sellPrice: 12.5, note: "Freight $75 invented" },
        { id: "6331K32", qty: 1, sellPrice: 340 },
      ],
    }),
  );
  await step("staff msg 2", () =>
    api(staff, "POST", `/api/quotes/${QUOTE}/activity`, {
      text: "Staff 2. Moving to Quoted so you can send PO CRAWL-16-524.",
    }),
  );
  await step("staff quoted", () =>
    api(staff, "PATCH", `/api/quotes/${QUOTE}`, { status: "quoted" }),
  );
  const afterQuoted = await step("cust sees quoted", () =>
    api(cust, "GET", `/api/quotes/${QUOTE}`),
  );
  const custItems = afterQuoted.json.quote?.items || [];
  await step("cust po", () =>
    api(cust, "PATCH", `/api/quotes/${QUOTE}`, { poNumber: "CRAWL-16-524" }),
  );
  await step("cust msg 3", () =>
    api(cust, "POST", `/api/quotes/${QUOTE}/activity`, {
      text: "Customer 3. PO CRAWL-16-524 entered. Please confirm.",
    }),
  );
  await step("staff po_received", () =>
    api(staff, "PATCH", `/api/quotes/${QUOTE}`, { status: "po_received" }),
  );
  await step("staff confirmed", () =>
    api(staff, "PATCH", `/api/quotes/${QUOTE}`, { status: "confirmed" }),
  );
  await step("staff ordered", () =>
    api(staff, "PATCH", `/api/quotes/${QUOTE}`, { status: "ordered" }),
  );
  await step("staff shipped", () =>
    api(staff, "PATCH", `/api/quotes/${QUOTE}`, {
      status: "shipped",
      shipments: [{ carrier: "UPS", trackingNumber: "1Z999CRAWL00000000" }],
    }),
  );
  await step("staff delivered", () =>
    api(staff, "PATCH", `/api/quotes/${QUOTE}`, { status: "delivered" }),
  );
  await step("staff invoice", () =>
    api(staff, "PATCH", `/api/quotes/${QUOTE}`, { invoiceNumber: "INV-CRAWL-16" }),
  );
  await step("staff closed", () =>
    api(staff, "PATCH", `/api/quotes/${QUOTE}`, { status: "closed" }),
  );
  await step("staff msg 3", () =>
    api(staff, "POST", `/api/quotes/${QUOTE}/activity`, {
      text: "Staff 3. Closed. Tracking 1Z999CRAWL00000000. Invoice INV-CRAWL-16.",
    }),
  );
  await step("cust msg 4", () =>
    api(cust, "POST", `/api/quotes/${QUOTE}/activity`, {
      text: "Customer 4. Thanks. Receiving the closed quote on our side.",
    }),
  );

  await step("cust ticket msg 1", () =>
    api(cust, "POST", `/api/tickets/${TICKET}/activity`, {
      text: "Care customer 1. Isolation ticket chatter follow-up.",
    }),
  );
  await step("staff ticket msg 1", () =>
    api(staff, "POST", `/api/tickets/${TICKET}/activity`, {
      text: "Care staff 1. Logged. We will check the palletizer on the next visit.",
    }),
  );
  await step("staff ticket progress", () =>
    api(staff, "PATCH", `/api/tickets/${TICKET}`, { status: "in_progress" }),
  );

  const finalCust = await api(cust, "GET", `/api/quotes/${QUOTE}`);
  const finalStaff = await api(staff, "GET", `/api/quotes/${QUOTE}`);
  const finalTicket = await api(cust, "GET", `/api/tickets/${TICKET}`);

  const report = {
    quoteId: QUOTE,
    ticketId: TICKET,
    log,
    customerQuote: {
      status: finalCust.status,
      quoteStatus: finalCust.json.quote?.status,
      poNumber: finalCust.json.quote?.poNumber,
      invoiceNumber: finalCust.json.quote?.invoiceNumber,
      itemPrices: (finalCust.json.quote?.items || []).map((i) => i.sellPrice),
      activities: activitySummary(finalCust.json.quote),
    },
    staffQuote: {
      status: finalStaff.status,
      quoteStatus: finalStaff.json.quote?.status,
      activities: activitySummary(finalStaff.json.quote),
    },
    ticket: {
      status: finalTicket.status,
      ticketStatus: finalTicket.json.ticket?.status,
      activities: activitySummary(finalTicket.json.ticket),
    },
    pricesVisibleAfterQuoted: custItems.some((i) => i.sellPrice != null),
    customerActivityCount: (finalCust.json.quote?.activities || []).length,
    staffActivityCount: (finalStaff.json.quote?.activities || []).length,
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
