/* Child process for blob-cas-processes.test.ts: one "serverless instance" writing to a shared data dir. */
import { createMachine, createTicket } from "./store.ts";
import { DEFAULT_TENANT_ID } from "./tenant.ts";

const tag = process.argv[2] ?? "w";
const count = Number(process.argv[3] ?? 5);

for (let i = 0; i < count; i++) {
  const machine = await createMachine(DEFAULT_TENANT_ID, { name: `${tag}-machine-${i}` });
  await createTicket(DEFAULT_TENANT_ID, {
    machineId: machine.id,
    title: `${tag}-ticket-${i}`,
    customerId: "c",
    customerEmail: "c@example.com",
    actor: { email: "c@example.com", role: "customer", id: "c" },
  });
}
console.log(`${tag} done`);
