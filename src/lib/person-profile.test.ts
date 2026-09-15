import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { createMemoryPersistence, setPersistenceForTests } from "./persistence.ts";
import {
  createCustomer,
  resetStoreMemoryForTests,
  SEED_CUSTOMER_ACCOUNTS,
  SEED_SITES,
  updatePerson,
} from "./store.ts";
import { DEFAULT_TENANT_ID } from "./tenant.ts";
import { toPublicUser } from "./access.ts";

const T = DEFAULT_TENANT_ID;

const SEED_NOW = "2020-01-01T00:00:00.000Z";

function seedPeopleDb() {
  return {
    schemaVersion: 2,
    customers: [...SEED_CUSTOMER_ACCOUNTS],
    sites: [...SEED_SITES],
    users: [
      {
        id: "user-staff",
        email: "staff@spares.local",
        passwordHash: "x",
        role: "staff" as const,
      },
    ],
    machines: [],
    quotes: [],
    bugReports: [],
    manuals: [],
    tickets: [],
    machineUsage: [],
  };
}

describe("person profile updates", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_ALLOW_SEED;
  });

  it("stores and updates profile name and email", async () => {
    process.env.SPARES_ALLOW_SEED = "true";
    const persistence = createMemoryPersistence();
    setPersistenceForTests(persistence);
    resetStoreMemoryForTests();
    await persistence.writeDatabaseJson(JSON.stringify(seedPeopleDb()));

    const created = await createCustomer(T, "profile-test@acme.test", "hash", {
      name: "Buyer One",
      siteIds: ["site-acme-dayton"],
    });
    assert.equal("user" in created, true);
    if (!("user" in created)) {
      return;
    }

    const publicUser = toPublicUser(created.user, SEED_SITES, SEED_CUSTOMER_ACCOUNTS);
    assert.equal(publicUser.name, "Buyer One");
    assert.equal(publicUser.email, "profile-test@acme.test");

    const renamed = await updatePerson(created.user.id, T, {
      name: "Acme Buyer",
      email: "procurement@acme.test",
    });
    assert.equal("user" in renamed, true);
    if (!("user" in renamed)) {
      return;
    }
    assert.equal(renamed.user.name, "Acme Buyer");
    assert.equal(renamed.user.email, "procurement@acme.test");

    const cleared = await updatePerson(created.user.id, T, { name: null });
    assert.equal("user" in cleared, true);
    if (!("user" in cleared)) {
      return;
    }
    assert.equal(cleared.user.name, undefined);
  });

  it("rejects duplicate email on profile update", async () => {
    process.env.SPARES_ALLOW_SEED = "true";
    const persistence = createMemoryPersistence();
    setPersistenceForTests(persistence);
    resetStoreMemoryForTests();
    await persistence.writeDatabaseJson(JSON.stringify(seedPeopleDb()));

    const first = await createCustomer(T, "first@acme.test", "hash");
    const second = await createCustomer(T, "second@acme.test", "hash");
    assert.equal("user" in first, true);
    assert.equal("user" in second, true);
    if (!("user" in first) || !("user" in second)) {
      return;
    }

    const conflict = await updatePerson(second.user.id, T, { email: "first@acme.test" });
    assert.equal("error" in conflict, true);
    assert.equal(conflict.error, "email-taken");
  });
});
