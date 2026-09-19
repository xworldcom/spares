import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { setPersistenceForTests } from "../persistence.ts";
import {
  appendTicketActivity,
  createMachine,
  createTicket,
  getTicket,
  resetStoreMemoryForTests,
  setTicketAssistantPaused,
  updatePlatformAssistantSettings,
} from "../store.ts";
import { DEFAULT_TENANT_ID } from "../tenant.ts";
import { ASSISTANT_EMAIL, ASSISTANT_NAME } from "./actor.ts";
import { replyAsAssistant } from "./reply.ts";

const T = DEFAULT_TENANT_ID;

async function isolatedDataDir() {
  const dir = await mkdtemp(path.join(tmpdir(), "spares-assistant-"));
  process.env.SPARES_DATA_DIR = dir;
  process.env.SPARES_ALLOW_SEED = "true";
  setPersistenceForTests(null);
  await mkdir(path.join(dir, "files"), { recursive: true });
  resetStoreMemoryForTests();
  return dir;
}

async function openTicket() {
  const machine = await createMachine(T, {
    name: "Assist cell",
    storedFileName: "assist-cell.glb",
    originalFileName: "assist-cell.glb",
    parts: [{ id: "PN-MTR-1", name: "Gearmotor", meshName: "PN-MTR-1", qty: 1 }],
    unmatched: [],
  });
  const created = await createTicket(T, {
    machineId: machine.id,
    title: "HMI fault",
    customerId: "user-customer",
    customerEmail: "customer@spares.local",
    actor: {
      id: "user-customer",
      email: "customer@spares.local",
      role: "customer",
    },
    note: "HMI shows E-14 after start.",
  });
  assert.equal("error" in created, false);
  if ("error" in created) {
    throw new Error("ticket");
  }
  return { machine, ticket: created.ticket };
}

describe("replyAsAssistant", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_DATA_DIR;
    delete process.env.SPARES_ALLOW_SEED;
  });

  it("does nothing while the platform switch is off", async () => {
    await isolatedDataDir();
    await updatePlatformAssistantSettings({ enabled: false });
    const { machine, ticket } = await openTicket();
    const result = await replyAsAssistant(
      {
        kind: "care",
        id: ticket.id,
        tenantId: T,
        machineId: machine.id,
        machineName: machine.name,
        triggerText: "HMI shows E-14 after start.",
        triggerRole: "customer",
        triggerEmail: "customer@spares.local",
      },
      async () => {
        throw new Error("generate should not run");
      },
    );
    assert.deepEqual(result, { skipped: "policy" });
    const loaded = await getTicket(ticket.id, T);
    assert.equal(loaded?.activities.some((row) => row.actorRole === "assistant"), false);
  });

  it("posts as AI when the model answers", async () => {
    await isolatedDataDir();
    await updatePlatformAssistantSettings({
      enabled: true,
      model: "google/gemini-3.8-flash",
    });
    const { machine, ticket } = await openTicket();
    const result = await replyAsAssistant(
      {
        kind: "care",
        id: ticket.id,
        tenantId: T,
        machineId: machine.id,
        machineName: machine.name,
        triggerText: "HMI shows E-14 after start.",
        triggerRole: "customer",
        triggerEmail: "customer@spares.local",
      },
      async (input) => {
        assert.equal(input.machine.id, machine.id);
        assert.equal(input.machine.parts[0]?.id, "PN-MTR-1");
        return { text: "E-14 is on page 12 of the operator manual.", escalate: false };
      },
    );
    assert.deepEqual(result, { replied: true });
    const loaded = await getTicket(ticket.id, T);
    const last = loaded?.activities.at(-1);
    assert.equal(last?.actorRole, "assistant");
    assert.equal(last?.actorEmail, ASSISTANT_EMAIL);
    assert.equal(last?.text, "E-14 is on page 12 of the operator manual.");
    assert.equal(ASSISTANT_NAME, "AI");
  });

  it("escalates when the user asks for a person", async () => {
    await isolatedDataDir();
    await updatePlatformAssistantSettings({ enabled: true });
    const { machine, ticket } = await openTicket();
    await appendTicketActivity(
      ticket.id,
      T,
      {
        id: "user-customer",
        email: "customer@spares.local",
        role: "customer",
      },
      "Please escalate this to a technician",
    );
    const result = await replyAsAssistant(
      {
        kind: "care",
        id: ticket.id,
        tenantId: T,
        machineId: machine.id,
        machineName: machine.name,
        triggerText: "Please escalate this to a technician",
        triggerRole: "customer",
        triggerEmail: "customer@spares.local",
      },
      async () => {
        throw new Error("generate should not run on force escalate");
      },
    );
    assert.equal(result.escalated, true);
    const loaded = await getTicket(ticket.id, T);
    assert.equal(loaded?.assistantPaused, true);
    assert.equal(loaded?.activities.at(-1)?.actorRole, "assistant");
    assert.match(loaded?.activities.at(-1)?.text ?? "", /service team/i);
  });

  it("escalates when the model cannot help", async () => {
    await isolatedDataDir();
    await updatePlatformAssistantSettings({ enabled: true });
    const { machine, ticket } = await openTicket();
    const result = await replyAsAssistant(
      {
        kind: "care",
        id: ticket.id,
        tenantId: T,
        machineId: machine.id,
        machineName: machine.name,
        triggerText: "HMI shows E-14 after start.",
        triggerRole: "customer",
        triggerEmail: "customer@spares.local",
      },
      async () => ({ text: "I do not have that drawing.", escalate: true }),
    );
    assert.equal(result.escalated, true);
    const loaded = await getTicket(ticket.id, T);
    assert.equal(loaded?.assistantPaused, true);
    const pausedAgain = await replyAsAssistant(
      {
        kind: "care",
        id: ticket.id,
        tenantId: T,
        machineId: machine.id,
        machineName: machine.name,
        triggerText: "Still broken",
        triggerRole: "customer",
        triggerEmail: "customer@spares.local",
      },
      async () => {
        throw new Error("should stay paused");
      },
    );
    assert.deepEqual(pausedAgain, { skipped: "policy" });
  });

  it("stays quiet when staff reply after the customer before AI runs", async () => {
    await isolatedDataDir();
    await updatePlatformAssistantSettings({ enabled: true });
    const { machine, ticket } = await openTicket();
    await appendTicketActivity(
      ticket.id,
      T,
      {
        id: "user-staff",
        email: "staff@spares.local",
        role: "staff",
      },
      "Checking the cabinet now",
    );
    const result = await replyAsAssistant(
      {
        kind: "care",
        id: ticket.id,
        tenantId: T,
        machineId: machine.id,
        machineName: machine.name,
        triggerText: "HMI shows E-14 after start.",
        triggerRole: "customer",
        triggerEmail: "customer@spares.local",
      },
      async () => {
        throw new Error("generate should not run after staff jumped in");
      },
    );
    assert.deepEqual(result, { skipped: "policy" });
  });

  it("answers staff only when they mention AI", async () => {
    await isolatedDataDir();
    await updatePlatformAssistantSettings({ enabled: true });
    const { machine, ticket } = await openTicket();
    await appendTicketActivity(
      ticket.id,
      T,
      {
        id: "user-staff",
        email: "staff@spares.local",
        role: "staff",
      },
      "@AI which motor is on that axis?",
    );
    const result = await replyAsAssistant(
      {
        kind: "care",
        id: ticket.id,
        tenantId: T,
        machineId: machine.id,
        machineName: machine.name,
        triggerText: "@AI which motor is on that axis?",
        triggerRole: "staff",
        triggerEmail: "staff@spares.local",
      },
      async (input) => {
        assert.equal(input.speakerRole, "staff");
        return { text: "PN-MTR-1 is the gearmotor on that axis.", escalate: false };
      },
    );
    assert.deepEqual(result, { replied: true });
  });

  it("does not escalate from a staff 'get a human' note", async () => {
    await isolatedDataDir();
    await updatePlatformAssistantSettings({ enabled: true });
    const { machine, ticket } = await openTicket();
    await appendTicketActivity(
      ticket.id,
      T,
      {
        id: "user-staff",
        email: "staff@spares.local",
        role: "staff",
      },
      "please escalate this",
    );
    const result = await replyAsAssistant(
      {
        kind: "care",
        id: ticket.id,
        tenantId: T,
        machineId: machine.id,
        machineName: machine.name,
        triggerText: "please escalate this",
        triggerRole: "staff",
        triggerEmail: "staff@spares.local",
      },
      async () => {
        throw new Error("staff escalate chatter should not call generate");
      },
    );
    assert.deepEqual(result, { skipped: "policy" });
    const loaded = await getTicket(ticket.id, T);
    assert.equal(loaded?.assistantPaused, undefined);
  });

  it("drops a pending reply if staff turn AI off while it is generating", async () => {
    await isolatedDataDir();
    await updatePlatformAssistantSettings({ enabled: true });
    const { machine, ticket } = await openTicket();
    const result = await replyAsAssistant(
      {
        kind: "care",
        id: ticket.id,
        tenantId: T,
        machineId: machine.id,
        machineName: machine.name,
        triggerText: "HMI shows E-14 after start.",
        triggerRole: "customer",
        triggerEmail: "customer@spares.local",
      },
      async () => {
        await setTicketAssistantPaused(ticket.id, T, true);
        return { text: "too late", escalate: false };
      },
    );
    assert.deepEqual(result, { skipped: "policy" });
    const loaded = await getTicket(ticket.id, T);
    assert.equal(loaded?.assistantPaused, true);
    assert.equal(loaded?.activities.some((row) => row.text === "too late"), false);
  });

  it("starts answering again after staff turn AI back on", async () => {
    await isolatedDataDir();
    await updatePlatformAssistantSettings({ enabled: true });
    const { machine, ticket } = await openTicket();
    await setTicketAssistantPaused(ticket.id, T, true);
    const paused = await replyAsAssistant(
      {
        kind: "care",
        id: ticket.id,
        tenantId: T,
        machineId: machine.id,
        machineName: machine.name,
        triggerText: "Still seeing E-14",
        triggerRole: "customer",
        triggerEmail: "customer@spares.local",
      },
      async () => {
        throw new Error("paused thread should not generate");
      },
    );
    assert.deepEqual(paused, { skipped: "policy" });
    await setTicketAssistantPaused(ticket.id, T, false);
    await appendTicketActivity(
      ticket.id,
      T,
      {
        id: "user-customer",
        email: "customer@spares.local",
        role: "customer",
      },
      "Still seeing E-14",
    );
    const result = await replyAsAssistant(
      {
        kind: "care",
        id: ticket.id,
        tenantId: T,
        machineId: machine.id,
        machineName: machine.name,
        triggerText: "Still seeing E-14",
        triggerRole: "customer",
        triggerEmail: "customer@spares.local",
      },
      async () => ({ text: "Try a reset from the operator manual.", escalate: false }),
    );
    assert.deepEqual(result, { replied: true });
  });
});
