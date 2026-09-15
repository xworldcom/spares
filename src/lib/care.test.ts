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
  nextTicketNumber,
  parseCareText,
  parseOptionalNumber,
  statusTicketText,
  ticketHref,
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
    assert.equal(countUnreadTickets(tickets, { id: "user-customer" }), 1);
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
      { id: "user-customer" },
      "Palletizer",
    );
    assert.equal(ticket.unread, true);
    assert.equal(ticket.machineName, "Palletizer");
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
