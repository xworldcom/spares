import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { DEFAULT_TENANT_ID } from "../tenant.ts";
import { hashPassword } from "../auth/password.ts";
import { setPersistenceForTests } from "../persistence.ts";
import {
  createCustomer,
  createCustomerAccount,
  createMachine,
  createSite,
  createTenantStaffUser,
  resetStoreMemoryForTests,
  updateTenantPlatformMeta,
} from "../store.ts";
import {
  chatEmailNotifyEnabled,
  notifyMachineChatUpdate,
  publicAppOrigin,
} from "./chat-email.ts";
import {
  filterMachineChatNotifyRecipients,
  isDeliverableEmail,
  loadMachineChatNotifyRecipients,
} from "./recipients.ts";
import { createChatEmailMailer, type OutboundEmail } from "./mailer.ts";

async function isolated() {
  const dir = await mkdtemp(path.join(tmpdir(), "spares-chat-email-"));
  process.env.SPARES_DATA_DIR = dir;
  process.env.SPARES_ALLOW_SEED = "false";
  setPersistenceForTests(null);
  await mkdir(path.join(dir, "files"), { recursive: true });
  resetStoreMemoryForTests();
  return dir;
}

describe("chat email notify recipients", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_DATA_DIR;
    delete process.env.SPARES_ALLOW_SEED;
    delete process.env.CHAT_EMAIL_NOTIFY;
    delete process.env.SPARES_PUBLIC_ORIGIN;
  });

  it("treats deliverable emails strictly", () => {
    assert.equal(isDeliverableEmail(""), false);
    assert.equal(isDeliverableEmail("not-an-email"), false);
    assert.equal(isDeliverableEmail("a@b.co"), true);
  });

  it("excludes sender, skips bad emails, and dedupes by address", () => {
    const machine = {
      id: "m1",
      siteId: "site-a",
      tenantId: DEFAULT_TENANT_ID,
    };
    const sites = [
      {
        id: "site-a",
        customerId: "cust",
        name: "Plant",
        createdAt: "2020-01-01T00:00:00.000Z",
      },
    ];
    const accounts = [{ id: "cust", name: "Cust", createdAt: "2020-01-01T00:00:00.000Z" }];
    const recipients = filterMachineChatNotifyRecipients({
      users: [
        {
          id: "sender",
          email: "sender@example.com",
          role: "staff",
          tenantId: DEFAULT_TENANT_ID,
          siteIds: [],
          machineIds: [],
        },
        {
          id: "peer",
          email: "peer@example.com",
          role: "staff",
          tenantId: DEFAULT_TENANT_ID,
          siteIds: [],
          machineIds: [],
        },
        {
          id: "dup",
          email: "PEER@example.com",
          role: "customer",
          tenantId: DEFAULT_TENANT_ID,
          siteIds: ["site-a"],
          machineIds: [],
        },
        {
          id: "no-mail",
          email: "broken",
          role: "customer",
          tenantId: DEFAULT_TENANT_ID,
          siteIds: ["site-a"],
          machineIds: [],
        },
        {
          id: "outsider",
          email: "outsider@example.com",
          role: "customer",
          tenantId: DEFAULT_TENANT_ID,
          siteIds: [],
          machineIds: [],
        },
      ],
      machine,
      sites,
      accounts,
      senderUserId: "sender",
      senderEmail: "sender@example.com",
    });
    assert.deepEqual(
      recipients.map((row) => row.email),
      ["peer@example.com"],
    );
  });

  it("filters customers by machine access in the catalog", async () => {
    await isolated();
    const accountRow = await createCustomerAccount("Acme", DEFAULT_TENANT_ID);
    assert.ok("account" in accountRow);
    const account = accountRow.account;
    const siteARow = await createSite(DEFAULT_TENANT_ID, account.id, "Plant A");
    const siteBRow = await createSite(DEFAULT_TENANT_ID, account.id, "Plant B");
    assert.ok("site" in siteARow && "site" in siteBRow);
    const siteA = siteARow.site;
    const siteB = siteBRow.site;
    const machine = await createMachine(DEFAULT_TENANT_ID, {
      name: "Line 1",
      storedFileName: "line.glb",
      originalFileName: "line.glb",
      parts: [],
      unmatched: [],
      siteId: siteA.id,
    });
    const passwordHash = await hashPassword("pass");
    await createTenantStaffUser(DEFAULT_TENANT_ID, {
      email: "staff-b@example.com",
      passwordHash,
      role: "staff",
    });
    await createCustomer(DEFAULT_TENANT_ID, "viewer@example.com", passwordHash, {
      siteIds: [siteA.id],
    });
    await createCustomer(DEFAULT_TENANT_ID, "other@example.com", passwordHash, {
      siteIds: [siteB.id],
    });

    const recipients = await loadMachineChatNotifyRecipients(
      DEFAULT_TENANT_ID,
      machine.id,
      { id: "user-staff", email: "staff@spares.local" },
    );
    const emails = recipients.map((row) => row.email).sort();
    assert.ok(emails.includes("staff-b@example.com"));
    assert.ok(emails.includes("viewer@example.com"));
    assert.equal(emails.includes("other@example.com"), false);
    assert.equal(emails.includes("staff@spares.local"), false);
  });
});

describe("notifyMachineChatUpdate", () => {
  after(() => {
    delete process.env.CHAT_EMAIL_NOTIFY;
    delete process.env.SPARES_PUBLIC_ORIGIN;
  });

  it("does nothing when CHAT_EMAIL_NOTIFY is off", async () => {
    delete process.env.CHAT_EMAIL_NOTIFY;
    assert.equal(chatEmailNotifyEnabled(), false);
    const sent: OutboundEmail[] = [];
    const result = await notifyMachineChatUpdate(
      {
        tenantId: DEFAULT_TENANT_ID,
        sender: { id: "a", email: "a@example.com" },
        text: "hello",
        attachmentCount: 0,
        context: {
          kind: "care",
          ticketId: "t1",
          ticketNumber: 1,
          ticketTitle: "Leak",
          machineId: "m1",
          machineName: "Line",
        },
      },
      {
        mailer: {
          async send(message) {
            sent.push(message);
          },
        },
      },
    );
    assert.equal(result.sentCount, 0);
    assert.equal(sent.length, 0);
  });

  it("sends when enabled and includes staff quote deep link", async () => {
    await isolated();
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
    const site = siteRow.site;
    const machine = await createMachine(DEFAULT_TENANT_ID, {
      name: "Palletizer",
      storedFileName: "p.glb",
      originalFileName: "p.glb",
      parts: [],
      unmatched: [],
      siteId: site.id,
    });
    const passwordHash = await hashPassword("pass");
    const staff = await createTenantStaffUser(DEFAULT_TENANT_ID, {
      email: "notify-staff@example.com",
      passwordHash,
      role: "staff",
    });
    assert.ok("user" in staff);

    const sent: OutboundEmail[] = [];
    const result = await notifyMachineChatUpdate(
      {
        tenantId: DEFAULT_TENANT_ID,
        sender: { id: "sender", email: "sender@example.com", name: "Sender" },
        text: "Need a quote",
        attachmentCount: 1,
        context: {
          kind: "quote",
          quoteNumber: 42,
          machineId: machine.id,
          machineName: "Palletizer",
        },
      },
      {
        mailer: {
          async send(message) {
            sent.push(message);
          },
        },
      },
    );
    assert.equal(result.sentCount, 1);
    assert.equal(sent.length, 1);
    assert.match(sent[0].text, /https:\/\/oee360\.com\/staff\/quotes\/42/);
    assert.match(sent[0].subject, /Quote #42/);
    assert.equal(sent[0].replyTo, undefined);
    assert.equal(publicAppOrigin(), "https://oee360.com");
  });
});

describe("default chat mailer", () => {
  it("logs replyTo when the message includes one", async () => {
    const lines: string[] = [];
    const original = console.info;
    console.info = ((line?: unknown) => {
      lines.push(String(line));
    }) as typeof console.info;
    try {
      await createChatEmailMailer().send({
        to: "tech@shape.com",
        subject: "Care ticket #7 on Palletizer",
        text: "Seal failed",
        replyTo: "cases@shape.com",
      });
    } finally {
      console.info = original;
    }
    assert.equal(
      lines[0],
      JSON.stringify({
        tag: "chat-email-notify",
        to: "tech@shape.com",
        subject: "Care ticket #7 on Palletizer",
        replyTo: "cases@shape.com",
      }),
    );
  });
});
