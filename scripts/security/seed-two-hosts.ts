/**
 * Seed two OEM hosts with two plants each for an isolation pen test.
 *
 * Local disposable store:
 *   SPARES_DATA_DIR=/tmp/oee360-iso SPARES_ALLOW_SEED=false \
 *     node --experimental-strip-types scripts/security/seed-two-hosts.ts
 *
 * Staging Blob namespace (never the unset Soft Launch namespace):
 *   BLOB_READ_WRITE_TOKEN=... SPARES_BLOB_NAMESPACE=pentest-2x2 SPARES_ALLOW_SEED=false \
 *     node --experimental-strip-types scripts/security/seed-two-hosts.ts
 *
 * SEED_PASSWORD sets every login's password. Without it one random password is printed.
 * The script refuses to run when a host it would create already exists.
 */
import { randomBytes } from "node:crypto";

if (!process.env.SPARES_DATA_DIR && !process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("Set SPARES_DATA_DIR (local) or BLOB_READ_WRITE_TOKEN + SPARES_BLOB_NAMESPACE (staging).");
  process.exit(1);
}
if (process.env.BLOB_READ_WRITE_TOKEN && !process.env.SPARES_BLOB_NAMESPACE) {
  console.error("Refusing to seed the default Blob namespace. Set SPARES_BLOB_NAMESPACE.");
  process.exit(1);
}
process.env.SPARES_ALLOW_SEED ??= "false";

const { hashPassword } = await import("../../src/lib/auth/password.ts");
const store = await import("../../src/lib/store.ts");

type PlantSpec = { name: string; site: string; machine: string; login: string };
type HostSpec = { name: string; staff: string; plants: [PlantSpec, PlantSpec] };

const HOSTS: [HostSpec, HostSpec] = [
  {
    name: "Acme Automation",
    staff: "staff@acme-oem.test",
    plants: [
      { name: "Northline Packing", site: "Northline Plant 1", machine: "Northline Case Packer", login: "ops@northline.test" },
      { name: "Southgate Foods", site: "Southgate Plant 4", machine: "Southgate Palletizer", login: "ops@southgate.test" },
    ],
  },
  {
    name: "Bolt Robotics",
    staff: "staff@bolt-oem.test",
    plants: [
      { name: "Eastfield Dairy", site: "Eastfield Creamery", machine: "Eastfield Filler", login: "ops@eastfield.test" },
      { name: "Westport Beverage", site: "Westport Line 2", machine: "Westport Labeler", login: "ops@westport.test" },
    ],
  },
];

const password = process.env.SEED_PASSWORD ?? `Iso-${randomBytes(9).toString("base64url")}`;
const passwordHash = await hashPassword(password);

const existing = await store.listTenants();
const clash = HOSTS.find((host) => existing.some((row) => row.name === host.name));
if (clash) {
  console.error(`Host "${clash.name}" already exists. Use a fresh SPARES_DATA_DIR or namespace.`);
  process.exit(1);
}

function fail(step: string, result: unknown): never {
  console.error(`${step} failed: ${JSON.stringify(result)}`);
  process.exit(1);
}

const rows: Array<Record<string, string>> = [];

for (const host of HOSTS) {
  const created = await store.createTenantWithOptionalStaff(host.name, {
    email: host.staff,
    passwordHash,
  });
  if (!("tenant" in created)) fail(`create host ${host.name}`, created);
  const tenantId = created.tenant.id;
  rows.push({ host: host.name, role: "staff", login: host.staff, tenantId, plant: "", machineId: "", quote: "", ticket: "" });

  for (const plant of host.plants) {
    const account = await store.createCustomerAccount(plant.name, tenantId);
    if (!("account" in account)) fail(`create plant ${plant.name}`, account);
    const sited = await store.createSite(tenantId, account.account.id, plant.site);
    const site = "site" in sited ? sited.site : undefined;
    if (!site) fail(`create site ${plant.site}`, sited);
    const slug = plant.machine.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const machine = await store.createMachine(tenantId, {
      name: plant.machine,
      storedFileName: `${slug}.glb`,
      originalFileName: `${slug}.glb`,
      parts: [{ id: `${slug}-p1`, name: "Drive belt", qty: 2, meshName: `${slug}-p1` }],
      unmatched: [],
      siteId: site.id,
    });
    const created = await store.createCustomer(tenantId, plant.login, passwordHash, {
      siteIds: [site.id],
      machineIds: [machine.id],
      name: `${plant.name} operations`,
    });
    const user = "user" in created ? created.user : undefined;
    if (!user) fail(`create login ${plant.login}`, created);
    const quote = await store.createQuote(tenantId, {
      machineId: machine.id,
      items: [{ id: `${slug}-p1`, qty: 1 }],
      customerId: user.id,
      customerEmail: user.email,
    });
    if ("error" in quote) fail(`create quote for ${plant.name}`, quote);
    const opened = await store.createTicket(tenantId, {
      machineId: machine.id,
      title: `${plant.machine} stops on cycle start`,
      customerId: user.id,
      customerEmail: user.email,
      actor: { id: user.id, email: user.email, role: "customer" },
    });
    const ticket = "ticket" in opened ? opened.ticket : undefined;
    if (!ticket) fail(`create ticket for ${plant.name}`, opened);
    rows.push({
      host: host.name,
      role: "customer",
      login: plant.login,
      tenantId,
      plant: plant.name,
      machineId: machine.id,
      quote: `#${quote.number} ${quote.id}`,
      ticket: `#${ticket.number} ${ticket.id}`,
    });
  }
}

console.log(`Password for every login: ${password}`);
console.table(rows);
console.log(
  "Expected: each customer sees only its own machine, quote, and ticket. Each staff login sees both plants of its host and nothing of the other host.",
);
