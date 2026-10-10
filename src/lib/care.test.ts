import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAccessCareMachine,
  canManageCare,
  careHref,
  hubCareHref,
  hubTicketHref,
  hubTicketsHref,
  isManualCategory,
  machineTicketsHref,
  isManualFilename,
  isTicketStatus,
  manualContentType,
  manualExtension,
  manualOverLimitMessage,
  countUnreadTickets,
  isTicketUnreadForUser,
  customerReadReceiptsForTicket,
  isCustomerReadThroughTicket,
  nextTicketNumber,
  parseCareText,
  parseOptionalNumber,
  statusTicketText,
  ticketHref,
  ticketRefMatches,
  ticketHeaderContextLine,
  ticketIsOpen,
  ticketStepState,
  toPublicTicket,
  usageSummary,
} from "./care.ts";
import { DEFAULT_TENANT_ID } from "./tenant.ts";
import { manualObjectKey } from "./manual-storage.ts";

describe("care manuals", () => {
  it("accepts PDF and Word filenames only", () => {
    assert.equal(isManualFilename("guide.pdf"), true);
    assert.equal(isManualFilename("guide.PDF"), true);
    assert.equal(isManualFilename("guide.docx"), true);
    assert.equal(isManualFilename("guide.doc"), true);
    assert.equal(isManualFilename("model.glb"), false);
    assert.equal(isManualFilename("notes.txt"), false);
  });

  it("maps extensions and content types", () => {
    assert.equal(manualExtension("HMI Manual.DOCX"), ".docx");
    assert.equal(manualContentType("safety.doc"), "application/msword");
    assert.equal(manualContentType("operator.pdf"), "application/pdf");
  });

  it("keeps manuals off the models/ prefix", () => {
    assert.equal(manualObjectKey("abc-manual.pdf"), "manuals/abc-manual.pdf");
    assert.equal(manualObjectKey("abc-manual.pdf").startsWith("models/"), false);
  });

  it("parses categories", () => {
    assert.equal(isManualCategory("operator"), true);
    assert.equal(isManualCategory("safety"), true);
    assert.equal(isManualCategory("glb"), false);
  });

  it("explains the 50 MB ceiling", () => {
    assert.match(manualOverLimitMessage(60 * 1024 * 1024), /50/);
  });
});

describe("care tickets", () => {
  it("orders the staff status pipeline", () => {
    assert.equal(ticketStepState("open", "open"), "current");
    assert.equal(ticketStepState("in_progress", "open"), "done");
    assert.equal(ticketStepState("open", "closed"), "todo");
    assert.equal(isTicketStatus("waiting_on_customer"), true);
    assert.equal(ticketIsOpen("waiting_on_customer"), true);
    assert.equal(ticketIsOpen("closed"), false);
    assert.equal(statusTicketText("in_progress"), "Status set to In progress");
  });

  it("assigns the next ticket number", () => {
    assert.equal(nextTicketNumber([]), 1);
    assert.equal(nextTicketNumber([{ number: 3 }, { number: 1 }]), 4);
  });

  it("builds care and ticket hrefs", () => {
    assert.equal(careHref("m1"), "/machines/m1/care");
    assert.equal(careHref("m1", "manuals"), "/machines/m1/care/manuals");
    assert.equal(ticketHref("m1", "t1"), "/machines/m1/care/tickets/t1");
    assert.equal(hubCareHref(), "/care");
    assert.equal(hubCareHref("tickets"), "/care/tickets");
    assert.equal(hubTicketsHref(), "/care/tickets");
    assert.equal(hubTicketHref("t1"), "/care/tickets/t1");
    assert.equal(machineTicketsHref("m1"), "/machines/m1/care/tickets");
    assert.equal(machineTicketsHref("m1", "t1"), "/machines/m1/care/tickets/t1");
  });

  it("matches a ticket URL by UUID or by number", () => {
    const ticket = { id: "ac03a328-b1a4-42ee-860b-a92112f9ab35", number: 5 };
    assert.equal(ticketRefMatches(ticket, ticket.id), true);
    assert.equal(ticketRefMatches(ticket, "5"), true);
    assert.equal(ticketRefMatches(ticket, "4"), false);
    assert.equal(ticketRefMatches(ticket, "other"), false);
  });

  it("counts unread tickets for tab badges", () => {
    const tickets = [
      {
        activities: [{ id: "a1", at: "2026-01-02T00:00:00.000Z" }],
        lastReadAt: {},
      },
      {
        activities: [{ id: "a2", at: "2026-01-02T00:00:00.000Z" }],
        lastReadAt: { "user-customer": "2026-01-03T00:00:00.000Z" },
      },
      {
        activities: [],
        lastReadAt: {},
      },
    ];
    assert.equal(
      countUnreadTickets(tickets, {
        id: "user-customer",
        email: "customer@spares.local",
        role: "customer",
      }),
      1,
    );
  });

  it("does not mark a ticket unread for staff after their own status change", () => {
    const ticket = {
      activities: [
        {
          id: "a1",
          at: "2026-01-02T00:00:00.000Z",
          actorRole: "staff" as const,
          actorEmail: "staff@spares.local",
          kind: "status" as const,
          text: "Status set to In progress",
        },
      ],
      lastReadAt: { "staff-1": "2026-01-02T00:00:00.000Z" },
    };
    const staff = {
      id: "staff-1",
      email: "staff@spares.local",
      role: "staff" as const,
    };
    assert.equal(isTicketUnreadForUser(ticket, staff), false);
  });

  it("marks unread from lastReadAt", () => {
    const ticket = toPublicTicket(
      {
        id: "t1",
        number: 1,
        machineId: "m1",
        title: "Belt slip",
        status: "open",
        createdAt: "2026-01-01T00:00:00.000Z",
        customerId: "user-customer",
        customerEmail: "customer@spares.local",
        activities: [
          {
            id: "a1",
            at: "2026-01-02T00:00:00.000Z",
            actorRole: "staff",
            actorEmail: "staff@spares.local",
            kind: "message",
            text: "On site Friday",
          },
        ],
        lastReadAt: { "user-customer": "2026-01-01T00:00:00.000Z" },
      },
      {
        id: "user-customer",
        email: "customer@spares.local",
        role: "customer",
      },
      "Palletizer",
    );
    assert.equal(ticket.unread, true);
    assert.equal(ticket.machineName, "Palletizer");
    assert.equal(ticket.customerReadReceipts, undefined);
  });

  it("builds staff-only customer read receipts from lastReadAt", () => {
    const record = {
      id: "t1",
      number: 1,
      machineId: "m1",
      title: "Belt slip",
      status: "open" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      customerId: "cust-a",
      customerEmail: "a@example.com",
      activities: [
        {
          id: "a1",
          at: "2026-01-02T00:00:00.000Z",
          actorRole: "staff" as const,
          actorEmail: "staff@spares.local",
          kind: "message" as const,
          text: "On site Friday",
        },
      ],
      lastReadAt: {
        "cust-a": "2026-01-02T01:00:00.000Z",
        "staff-1": "2026-01-02T01:00:00.000Z",
        "cust-b": "2026-01-01T00:00:00.000Z",
      },
    };
    const customers = [
      { id: "cust-a", email: "a@example.com", name: "Alex", role: "customer" as const },
      { id: "cust-b", email: "b@example.com", role: "customer" as const },
      { id: "staff-1", email: "staff@spares.local", role: "staff" as const },
    ];
    assert.deepEqual(customerReadReceiptsForTicket(record, customers), [
      {
        userId: "cust-a",
        email: "a@example.com",
        name: "Alex",
        readAt: "2026-01-02T01:00:00.000Z",
      },
    ]);
    assert.equal(isCustomerReadThroughTicket(record, "cust-a"), true);
    assert.equal(isCustomerReadThroughTicket(record, "cust-b"), false);

    const staffView = toPublicTicket(
      record,
      { id: "staff-1", email: "staff@spares.local", role: "staff" },
      "Line",
      {
      customerUsers: customers,
      },
    );
    assert.equal(staffView.customerReadReceipts?.length, 1);
    assert.equal(staffView.customerReadReceipts?.[0]?.email, "a@example.com");

    const customerView = toPublicTicket(
      record,
      { id: "cust-a", email: "a@example.com", role: "customer" },
      "Line",
      {
      customerUsers: customers,
      },
    );
    assert.equal(customerView.customerReadReceipts, undefined);
  });
});

describe("care access and usage", () => {
  it("lets staff manage care and customers only their plant", () => {
    assert.equal(canManageCare({ role: "staff" }), true);
    assert.equal(canManageCare({ role: "customer" }), false);
    assert.equal(
      canAccessCareMachine(
        {
          role: "staff",
          siteIds: [],
          companyAccess: [],
          machineIds: [],
          tenantId: DEFAULT_TENANT_ID,
        },
        { id: "m1", siteId: "site-x", tenantId: DEFAULT_TENANT_ID },
      ),
      true,
    );
    assert.equal(
      canAccessCareMachine(
        {
          role: "customer",
          siteIds: ["site-cargill-ftw"],
          companyAccess: [],
          machineIds: [],
        },
        { id: "m1", siteId: "site-acme-dayton" },
      ),
      false,
    );
    assert.equal(
      canAccessCareMachine(
        {
          role: "customer",
          siteIds: ["site-cargill-ftw"],
          companyAccess: [],
          machineIds: [],
        },
        { id: "m1", siteId: "site-cargill-ftw" },
      ),
      true,
    );
  });

  it("summarizes usage edits", () => {
    assert.equal(
      usageSummary(null, { hours: 1200, cycles: 10, lastServiceAt: "2026-09-01", notes: "OK" }),
      "Set hours to 1200 · Set cycles to 10 · Last service 2026-09-01 · Updated notes",
    );
    assert.equal(
      usageSummary(
        {
          machineId: "m1",
          hours: 1200,
          cycles: 10,
          lastServiceAt: "2026-09-01",
          notes: "OK",
          updatedAt: "2026-09-01T00:00:00.000Z",
          updatedByEmail: "staff@spares.local",
          history: [],
        },
        { hours: 1240, cycles: 10, lastServiceAt: "2026-09-01", notes: "OK" },
      ),
      "Hours 1200 → 1240",
    );
  });

  it("validates titles and numbers", () => {
    assert.equal(parseCareText("  Belt  ", "Title").ok, true);
    assert.equal(parseCareText("   ", "Title").ok, false);
    assert.equal(parseOptionalNumber("12", "Hours").ok, true);
    assert.equal(parseOptionalNumber(-1, "Hours").ok, false);
  });
});

describe("ticketHeaderContextLine", () => {
  it("hides the opening note when the thread already shows it", () => {
    const ticket = {
      title: "Jam on infeed",
      activities: [
        {
          id: "m1",
          at: "2026-01-01T00:00:00.000Z",
          actorRole: "customer" as const,
          actorEmail: "user@demo.com",
          kind: "message" as const,
          text: "Only message in thread",
        },
      ],
    };
    assert.equal(ticketHeaderContextLine(ticket), null);
  });

  it("falls back to context when there are no messages yet", () => {
    const ticket = {
      title: "Jam on infeed",
      activities: [
        {
          id: "s1",
          at: "2026-01-01T00:00:00.000Z",
          actorRole: "staff" as const,
          actorEmail: "staff@demo.com",
          kind: "status" as const,
          text: "Ticket opened",
        },
      ],
    };
    assert.equal(ticketHeaderContextLine(ticket), null);
  });
});
