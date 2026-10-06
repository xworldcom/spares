import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { hashPassword } from "./auth/password.ts";
import {
  allocateInboundLocalPart,
  careTicketEmailLive,
  decideInboundCareAction,
  ensureHostTicketMailbox,
  hostTicketMailbox,
  inboundCareHttpResult,
  inboundMailDomain,
  outboundCareHeaders,
  parseDisplayTicketEmail,
  parseInboundCarePayload,
  type InboundCareMessage,
} from "./care-ticket-email.ts";
import { notifyMachineChatUpdate } from "./notifications/chat-email.ts";
import type { OutboundEmail } from "./notifications/mailer.ts";
import { createMemoryPersistence, setPersistenceForTests } from "./persistence.ts";
import {
  createCustomerAccount,
  createMachine,
  createSite,
  createTenantStaffUser,
  createTenantWithOptionalStaff,
  getPlatformDeployment,
  listTenants,
  resetStoreMemoryForTests,
  updateTenantPlatformMeta,
} from "./store.ts";
import { DEFAULT_TENANT_ID, DEFAULT_TENANT_NAME, defaultTenantRecord } from "./tenant.ts";
import { migrateTenants, newTenantFromName } from "./tenant-migration.ts";
import type { Tenant } from "../types/index.ts";

function restoreEnv(name: string, previous: string | undefined) {
  if (previous === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = previous;
  }
}

function shapeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: "tenant-shape",
    name: "Shape",
    slug: "shape",
    createdAt: "2020-01-01T00:00:00.000Z",
    ssoDomains: ["shape.com"],
    ...overrides,
  };
}

const inboundMessage: InboundCareMessage = {
  to: "shape@tickets.oee360.com",
  from: "tech@shape.com",
  subject: "Leak",
  text: "Seal failed",
  messageId: "<m@shape.com>",
};

async function isolated() {
  const dir = await mkdtemp(path.join(tmpdir(), "spares-care-mail-"));
  process.env.SPARES_DATA_DIR = dir;
  process.env.SPARES_ALLOW_SEED = "false";
  setPersistenceForTests(createMemoryPersistence());
  await mkdir(path.join(dir, "files"), { recursive: true });
  resetStoreMemoryForTests();
  return dir;
}

describe("care ticket email mailbox", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_DATA_DIR;
    delete process.env.SPARES_ALLOW_SEED;
    delete process.env.CARE_TICKET_EMAIL_LIVE;
    delete process.env.CARE_INBOUND_DOMAIN;
    delete process.env.CHAT_EMAIL_NOTIFY;
    delete process.env.SPARES_PUBLIC_ORIGIN;
  });

  it("allocates a lowercase local-part and suffixes when that part is taken", () => {
    assert.equal(allocateInboundLocalPart("Shape", new Set()), "shape");
    assert.equal(allocateInboundLocalPart("shape", new Set(["shape"])), "shape-2");
    assert.equal(
      allocateInboundLocalPart("shape", new Set(["shape", "shape-2"])),
      "shape-3",
    );
    const taken = new Set<string>();
    const first = allocateInboundLocalPart("acme", taken);
    taken.add(first);
    assert.equal(first, "acme");
    assert.equal(allocateInboundLocalPart("acme", taken), "acme-2");
  });

  it("parses a display ticket email and clears blanks", () => {
    assert.deepEqual(parseDisplayTicketEmail("  Cases@Shape.com "), {
      ok: true,
      address: "cases@shape.com",
    });
    assert.deepEqual(parseDisplayTicketEmail(""), { ok: true, address: null });
    assert.deepEqual(parseDisplayTicketEmail(null), { ok: true, address: null });
    assert.deepEqual(parseDisplayTicketEmail("not-an-email"), {
      ok: false,
      message: "Enter a valid display ticket email such as cases@shape.com",
    });
  });

  it("keeps the live flag off unless CARE_TICKET_EMAIL_LIVE is 1, true, or yes", () => {
    const previous = process.env.CARE_TICKET_EMAIL_LIVE;
    try {
      delete process.env.CARE_TICKET_EMAIL_LIVE;
      assert.equal(careTicketEmailLive(), false);
      process.env.CARE_TICKET_EMAIL_LIVE = "0";
      assert.equal(careTicketEmailLive(), false);
      process.env.CARE_TICKET_EMAIL_LIVE = "1";
      assert.equal(careTicketEmailLive(), true);
      process.env.CARE_TICKET_EMAIL_LIVE = "yes";
      assert.equal(careTicketEmailLive(), true);
      process.env.CARE_TICKET_EMAIL_LIVE = "true";
      assert.equal(careTicketEmailLive(), true);
    } finally {
      restoreEnv("CARE_TICKET_EMAIL_LIVE", previous);
    }
  });

  it("uses tickets.oee360.com when CARE_INBOUND_DOMAIN is unset", () => {
    const previous = process.env.CARE_INBOUND_DOMAIN;
    try {
      delete process.env.CARE_INBOUND_DOMAIN;
      assert.equal(inboundMailDomain(), "tickets.oee360.com");
      process.env.CARE_INBOUND_DOMAIN = "mail.example.com";
      assert.equal(inboundMailDomain(), "mail.example.com");
    } finally {
      restoreEnv("CARE_INBOUND_DOMAIN", previous);
    }
  });

  it("parses an inbound payload and rejects a missing from address", () => {
    assert.deepEqual(
      parseInboundCarePayload({
        to: " Shape@tickets.oee360.com ",
        from: "Tech@shape.com",
        subject: "Leak",
        text: "Seal failed",
        inReplyTo: "<a@shape.com>",
        messageId: "<m@shape.com>",
      }),
      {
        ok: true,
        payload: {
          to: "shape@tickets.oee360.com",
          from: "tech@shape.com",
          subject: "Leak",
          text: "Seal failed",
          inReplyTo: "<a@shape.com>",
          messageId: "<m@shape.com>",
        },
      },
    );
    assert.deepEqual(parseInboundCarePayload({ subject: "Leak", text: "Seal failed" }), {
      ok: false,
      message: "Inbound to must be an email address",
    });
  });

  it("frames every inbound decision while the live flag is off", () => {
    const previous = process.env.CARE_TICKET_EMAIL_LIVE;
    try {
      delete process.env.CARE_TICKET_EMAIL_LIVE;
      assert.deepEqual(
        decideInboundCareAction(inboundMessage, {
          mailbox: { tenantId: "tenant-shape", inboundAddress: "shape@tickets.oee360.com" },
          sender: { userId: "user-tech" },
          replyTicketId: "ticket-9",
        }),
        { kind: "framed" },
      );
      process.env.CARE_TICKET_EMAIL_LIVE = "1";
      assert.deepEqual(
        decideInboundCareAction(inboundMessage, {
          mailbox: null,
          sender: { userId: "user-tech" },
          replyTicketId: null,
        }),
        { kind: "drop", reason: "unknown-mailbox" },
      );
      assert.deepEqual(
        decideInboundCareAction(inboundMessage, {
          mailbox: { tenantId: "tenant-shape", inboundAddress: "shape@tickets.oee360.com" },
          sender: null,
          replyTicketId: null,
        }),
        { kind: "drop", reason: "guest" },
      );
      assert.deepEqual(
        decideInboundCareAction(inboundMessage, {
          mailbox: { tenantId: "tenant-shape", inboundAddress: "shape@tickets.oee360.com" },
          sender: { userId: "user-tech" },
          replyTicketId: null,
        }),
        {
          kind: "create",
          tenantId: "tenant-shape",
          from: "tech@shape.com",
          subject: "Leak",
          text: "Seal failed",
          messageId: "<m@shape.com>",
        },
      );
      assert.deepEqual(
        decideInboundCareAction(inboundMessage, {
          mailbox: { tenantId: "tenant-shape", inboundAddress: "shape@tickets.oee360.com" },
          sender: { userId: "user-tech" },
          replyTicketId: "ticket-9",
        }),
        {
          kind: "append",
          tenantId: "tenant-shape",
          ticketId: "ticket-9",
          from: "tech@shape.com",
          text: "Seal failed",
          messageId: "<m@shape.com>",
        },
      );
    } finally {
      restoreEnv("CARE_TICKET_EMAIL_LIVE", previous);
    }
  });

  it("keeps an existing local-part when ensure runs again", () => {
    const previousDomain = process.env.CARE_INBOUND_DOMAIN;
    try {
      delete process.env.CARE_INBOUND_DOMAIN;
      const first = ensureHostTicketMailbox(shapeTenant(), new Set());
      const second = ensureHostTicketMailbox(first.tenant, new Set(["shape", "other"]));
      assert.equal(first.mailbox.inboundLocalPart, "shape");
      assert.equal(first.mailbox.inboundAddress, "shape@tickets.oee360.com");
      assert.equal(first.mailbox.displayAddress, null);
      assert.equal(second.mailbox.inboundLocalPart, "shape");
      assert.equal(second.tenant.ticketInboundLocalPart, "shape");
      assert.deepEqual(second.tenant.ssoDomains, ["shape.com"]);
      assert.deepEqual(
        outboundCareHeaders(
          hostTicketMailbox(shapeTenant({ ticketInboundLocalPart: "shape", ticketEmailDisplay: "cases@shape.com" }))!,
        ),
        { replyTo: "cases@shape.com" },
      );
      assert.deepEqual(
        outboundCareHeaders(hostTicketMailbox(shapeTenant({ ticketInboundLocalPart: "shape" }))!),
        { replyTo: "shape@tickets.oee360.com" },
      );
    } finally {
      restoreEnv("CARE_INBOUND_DOMAIN", previousDomain);
    }
  });

  it("gives the Soft Launch host a local-part on migrate when the field is missing", () => {
    const host = {
      id: DEFAULT_TENANT_ID,
      name: DEFAULT_TENANT_NAME,
      slug: "oee360-host",
      createdAt: "2020-01-01T00:00:00.000Z",
    };
    const first = migrateTenants({
      schemaVersion: 3,
      tenants: [host],
      users: [],
      customers: [],
      sites: [],
      machines: [],
      quotes: [],
      bugReports: [],
    });
    assert.equal(first.changed, true);
    assert.equal(first.db.tenants?.[0]?.ticketInboundLocalPart, "oee360-host");
    const second = migrateTenants(first.db);
    assert.equal(second.changed, false);
    assert.equal(second.db.tenants?.[0]?.ticketInboundLocalPart, "oee360-host");
    assert.equal(defaultTenantRecord("2020-01-01T00:00:00.000Z").ticketInboundLocalPart, "oee360-host");
    assert.equal(
      newTenantFromName("Shape", "2020-01-01T00:00:00.000Z", new Set(["shape"])).ticketInboundLocalPart,
      "shape-2",
    );
  });

  it("suffixes a new host when another live host already owns that local-part", async () => {
    const persistence = createMemoryPersistence();
    const dir = await mkdtemp(path.join(tmpdir(), "spares-care-mail-take-"));
    process.env.SPARES_DATA_DIR = dir;
    process.env.SPARES_ALLOW_SEED = "false";
    setPersistenceForTests(persistence);
    await mkdir(path.join(dir, "files"), { recursive: true });
    resetStoreMemoryForTests();
    await persistence.writeDatabaseJson(
      JSON.stringify({
        schemaVersion: 3,
        tenants: [
          {
            id: "tenant-legacy",
            name: "Legacy",
            slug: "legacy",
            createdAt: "2020-01-01T00:00:00.000Z",
            ticketInboundLocalPart: "acme",
          },
        ],
        users: [],
        machines: [],
        quotes: [],
        bugReports: [],
        customers: [],
        sites: [],
      }),
    );
    const created = await createTenantWithOptionalStaff("Acme");
    assert.ok("tenant" in created);
    if (!("tenant" in created)) {
      return;
    }
    assert.equal(created.tenant.slug, "acme");
    assert.equal(created.tenant.ticketInboundLocalPart, "acme-2");
    const updated = await updateTenantPlatformMeta(created.tenant.id, {
      ticketEmailDisplay: "cases@acme.com",
    });
    assert.ok("tenant" in updated);
    if (!("tenant" in updated)) {
      return;
    }
    assert.equal(updated.tenant.ticketEmailDisplay, "cases@acme.com");
    assert.equal(updated.tenant.ticketInboundLocalPart, "acme-2");
    assert.equal(updated.tenant.name, "Acme");
    const listed = await listTenants();
    const row = listed.find((tenant) => tenant.id === created.tenant.id);
    assert.equal(row?.ticketInboundLocalPart, "acme-2");
    assert.equal(row?.ticketEmailDisplay, "cases@acme.com");
  });

  it("fills a missing local-part when the host detail is loaded", async () => {
    await isolated();
    const persistence = createMemoryPersistence();
    setPersistenceForTests(persistence);
    resetStoreMemoryForTests();
    await persistence.writeDatabaseJson(
      JSON.stringify({
        schemaVersion: 3,
        tenants: [
          {
            id: DEFAULT_TENANT_ID,
            name: DEFAULT_TENANT_NAME,
            slug: "oee360-host",
            createdAt: "2020-01-01T00:00:00.000Z",
            ssoDomains: ["oee360.com"],
          },
        ],
        users: [],
        machines: [],
        quotes: [],
        bugReports: [],
        customers: [],
        sites: [],
      }),
    );
    const detail = await getPlatformDeployment(DEFAULT_TENANT_ID);
    assert.ok(!("error" in detail));
    if ("error" in detail) {
      return;
    }
    assert.equal(detail.deployment.tenant.ticketInboundLocalPart, "oee360-host");
    assert.deepEqual(detail.deployment.tenant.ssoDomains, ["oee360.com"]);
    const again = await getPlatformDeployment(DEFAULT_TENANT_ID);
    assert.ok(!("error" in again));
    if ("error" in again) {
      return;
    }
    assert.equal(again.deployment.tenant.ticketInboundLocalPart, "oee360-host");
  });

  it("answers framed when the flag is off and refuses to wire inbound when the flag is on", () => {
    const previous = process.env.CARE_TICKET_EMAIL_LIVE;
    const payload = {
      to: "shape@tickets.oee360.com",
      from: "tech@shape.com",
      subject: "Leak",
      text: "Seal failed",
    };
    try {
      delete process.env.CARE_TICKET_EMAIL_LIVE;
      assert.deepEqual(inboundCareHttpResult(payload), {
        status: 200,
        body: { live: false, framed: true },
      });
      process.env.CARE_TICKET_EMAIL_LIVE = "1";
      assert.deepEqual(inboundCareHttpResult(payload), {
        status: 503,
        body: { live: false, error: "inbound-not-wired" },
      });
      assert.deepEqual(inboundCareHttpResult({ text: "Seal failed" }), {
        status: 400,
        body: { error: "Inbound to must be an email address" },
      });
    } finally {
      restoreEnv("CARE_TICKET_EMAIL_LIVE", previous);
    }
  });

  it("sets Care replyTo from the display address when notify is enabled", async () => {
    await isolated();
    const previousNotify = process.env.CHAT_EMAIL_NOTIFY;
    const previousOrigin = process.env.SPARES_PUBLIC_ORIGIN;
    const previousDomain = process.env.CARE_INBOUND_DOMAIN;
    try {
      process.env.CHAT_EMAIL_NOTIFY = "1";
      process.env.SPARES_PUBLIC_ORIGIN = "https://oee360.com";
      delete process.env.CARE_INBOUND_DOMAIN;
      const display = await updateTenantPlatformMeta(DEFAULT_TENANT_ID, {
        ticketEmailDisplay: "cases@shape.com",
      });
      assert.ok("tenant" in display);
      const accountRow = await createCustomerAccount("Notify Co", DEFAULT_TENANT_ID);
      assert.ok("account" in accountRow);
      const siteRow = await createSite(DEFAULT_TENANT_ID, accountRow.account.id, "Main");
      assert.ok("site" in siteRow);
      const machine = await createMachine(DEFAULT_TENANT_ID, {
        name: "Palletizer",
        storedFileName: "p.glb",
        originalFileName: "p.glb",
        parts: [],
        unmatched: [],
        siteId: siteRow.site.id,
      });
      const passwordHash = await hashPassword("pass");
      const staff = await createTenantStaffUser(DEFAULT_TENANT_ID, {
        email: "notify-staff@example.com",
        passwordHash,
        role: "staff",
      });
      assert.ok("user" in staff);
      const sent: OutboundEmail[] = [];
      const mailer = {
        async send(message: OutboundEmail) {
          sent.push(message);
        },
      };
      const care = await notifyMachineChatUpdate(
        {
          tenantId: DEFAULT_TENANT_ID,
          sender: { id: "sender", email: "sender@example.com", name: "Sender" },
          text: "Seal failed",
          attachmentCount: 0,
          context: {
            kind: "care",
            ticketId: "ticket-7",
            ticketNumber: 7,
            ticketTitle: "Leak",
            machineId: machine.id,
            machineName: "Palletizer",
          },
        },
        { mailer },
      );
      assert.equal(care.sentCount, 1);
      assert.equal(sent.length, 1);
      assert.equal(sent[0].to, "notify-staff@example.com");
      assert.equal(sent[0].replyTo, "cases@shape.com");
      assert.equal(sent[0].subject, "Care ticket #7 on Palletizer");
      assert.match(sent[0].text, /https:\/\/oee360\.com\/care\/tickets\/ticket-7/);
    } finally {
      restoreEnv("CHAT_EMAIL_NOTIFY", previousNotify);
      restoreEnv("SPARES_PUBLIC_ORIGIN", previousOrigin);
      restoreEnv("CARE_INBOUND_DOMAIN", previousDomain);
    }
  });
});
