/* Child process for ticket-shard-blob.test.ts — shared SPARES_DATA_DIR + entityShardsV1. */
import { readRecordVersion } from "./record-meta.ts";
import { createTicket, getTicket, updateTicketStatus } from "./store.ts";
import { DEFAULT_TENANT_ID } from "./tenant.ts";

const T = DEFAULT_TENANT_ID;
const action = process.argv[2];
const ticketId = process.argv[3];

if (action === "create") {
  const machineId = "line-1";
  const created = await createTicket(T, {
    machineId,
    title: `shard-proc-${Date.now()}`,
    customerId: "c",
    customerEmail: "c@example.com",
    actor: { email: "staff@spares.local", role: "staff", id: "staff" },
  });
  const ticket = "ticket" in created ? created.ticket : undefined;
  if (!ticket) {
    console.error("create failed");
    process.exit(1);
  }
  console.log(ticket.id);
  process.exit(0);
}

if (action === "status" && ticketId) {
  const base = await getTicket(ticketId, T);
  if (!base) {
    console.error("ticket not found");
    process.exit(1);
  }
  const staff = { id: "staff", email: "staff@spares.local", role: "staff" as const };
  const next = await updateTicketStatus(ticketId, T, "in_progress", staff, {
    actor: { id: staff.id, email: staff.email, name: "Staff" },
    lock: {
      base,
      expectedVersion: readRecordVersion(base),
      touchedFields: ["status"],
    },
  });
  console.log(next?.status ?? "null");
  process.exit(next?.status === "in_progress" ? 0 : 1);
}

console.error("usage: create | status <ticketId>");
process.exit(1);
