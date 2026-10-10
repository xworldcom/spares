import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import {
  DEMO_MULTI_MACHINE_BEARING_PART_NUMBER,
  DEMO_TENANT_BUYER,
  DEMO_TENANT_DATA_MIGRATION_B1,
  DEMO_TENANT_DATA_MIGRATION_B2,
  DEMO_TENANT_DATA_MIGRATION_V1,
  applyDemoTenantB1Migration,
  applyDemoTenantB2StageQuotesMigration,
  applyDemoTenantV1Migration,
} from "./demo-tenant-data-migration.ts";
import { DEMO_STAGE_QUOTE_IDS } from "./demo-stage-quote-seed.ts";
import { setPersistenceForTests } from "./persistence.ts";
import { buildTenantPartCatalog } from "./part-lifecycle.ts";
import { FIXTURE_MACHINE_IDS } from "./seed-fixtures.ts";
import {
  findUserByEmail,
  getMachine,
  listMachines,
  listTenantPartLifecycleCatalog,
  resetStoreMemoryForTests,
} from "./store.ts";
import type { StoredMachine } from "./store.ts";
import { DEFAULT_TENANT_ID } from "./tenant.ts";

const T = DEFAULT_TENANT_ID;
const previousSeed = process.env.SPARES_ALLOW_SEED;

async function productionLikeStore() {
  process.env.SPARES_ALLOW_SEED = "false";
  const dir = await mkdtemp(path.join(tmpdir(), "spares-demo-migrate-"));
  process.env.SPARES_DATA_DIR = dir;
  setPersistenceForTests(null);
  await mkdir(path.join(dir, "files"), { recursive: true });
  resetStoreMemoryForTests();
  return dir;
}

after(() => {
  if (previousSeed === undefined) {
    delete process.env.SPARES_ALLOW_SEED;
  } else {
    process.env.SPARES_ALLOW_SEED = previousSeed;
  }
});

describe("demo tenant v1 migration (auto)", () => {
  it("runs once from an empty catalog and is a no-op on second apply", async () => {
    await productionLikeStore();
    const empty = {
      users: [],
      machines: [],
      partLifecycle: [],
    };
    const noopPersist = async () => undefined;
    const first = await applyDemoTenantV1Migration(empty, "migration@oee360.com", noopPersist);
    assert.ok(first.changed);
    assert.equal(first.db.dataMigrations?.demoTenantV1, DEMO_TENANT_DATA_MIGRATION_V1);
    assert.equal(await findUserByEmail(DEMO_TENANT_BUYER.email), null);

    const second = await applyDemoTenantV1Migration(first.db, "migration@oee360.com", noopPersist);
    assert.equal(second.changed, false);
  });

  it("does not change passwordHash or sessionStamp for an existing demo buyer", async () => {
    const noopPersist = async () => undefined;
    const passwordHash = "existing-hash-must-not-change";
    const sessionStamp = 7;
    const seed = {
      users: [
        {
          id: "existing-demo-buyer",
          email: DEMO_TENANT_BUYER.email,
          passwordHash,
          role: "customer" as const,
          tenantId: DEFAULT_TENANT_ID,
          siteIds: [],
          machineIds: [],
          name: DEMO_TENANT_BUYER.name,
          sessionStamp,
        },
      ],
      machines: [],
      partLifecycle: [],
    };

    const first = await applyDemoTenantV1Migration(seed, "migration@oee360.com", noopPersist);
    assert.ok(first.changed);
    const afterFirst = first.db.users.find((user) => user.email === DEMO_TENANT_BUYER.email);
    assert.ok(afterFirst);
    assert.equal(afterFirst.passwordHash, passwordHash);
    assert.equal(afterFirst.sessionStamp, sessionStamp);
    assert.ok(afterFirst.machineIds?.includes(FIXTURE_MACHINE_IDS.hardware));

    const replay = {
      ...first.db,
      dataMigrations: { demoTenantV1: undefined },
    };
    const second = await applyDemoTenantV1Migration(replay, "migration@oee360.com", noopPersist);
    assert.ok(second.changed);
    const afterSecond = second.db.users.find((user) => user.email === DEMO_TENANT_BUYER.email);
    assert.ok(afterSecond);
    assert.equal(afterSecond.passwordHash, passwordHash);
    assert.equal(afterSecond.sessionStamp, sessionStamp);
  });

  it("hydrates hardware fixture via catalog read (empty store boot)", async () => {
    await productionLikeStore();
    await listMachines(T);
    resetStoreMemoryForTests();
    assert.ok(await getMachine(FIXTURE_MACHINE_IDS.hardware, T));
    const rows = await listTenantPartLifecycleCatalog(T, { status: "all" });
    const by = Object.fromEntries(rows.map((row) => [row.partNumber, row.lifecycle.status]));
    assert.equal(by["6331K32"], "obsolete");
    assert.equal(by["5972K325"], "announced");
    assert.ok(
      (await listMachines(T)).some((row) => row.id === FIXTURE_MACHINE_IDS.hardware),
    );
  });

  it("grants hardware-fixture to an existing user@demo.com without creating the account", async () => {
    const noopPersist = async () => undefined;
    const seed = {
      users: [
        {
          id: "preexisting-demo-buyer",
          email: DEMO_TENANT_BUYER.email,
          passwordHash: "preexisting-hash",
          role: "customer" as const,
          tenantId: DEFAULT_TENANT_ID,
          machineIds: [],
          name: DEMO_TENANT_BUYER.name,
        },
      ],
      machines: [],
      partLifecycle: [],
    };
    const result = await applyDemoTenantV1Migration(seed, "migration@oee360.com", noopPersist);
    assert.ok(result.changed);
    const buyer = result.db.users.find((user) => user.email === DEMO_TENANT_BUYER.email);
    assert.ok(buyer);
    assert.ok(buyer.machineIds?.includes(FIXTURE_MACHINE_IDS.hardware));
    assert.equal(buyer.passwordHash, "preexisting-hash");
  });

  it("adds the shared bearing to palletizer for multi-machine catalog rows", async () => {
    const noopPersist = async () => undefined;
    const seed = {
      users: [],
      machines: [
        {
          id: FIXTURE_MACHINE_IDS.hardware,
          tenantId: DEFAULT_TENANT_ID,
          storedFileName: "hardware.glb",
          name: "Hardware fixture",
          parts: [
            {
              id: DEMO_MULTI_MACHINE_BEARING_PART_NUMBER,
              name: "Bearing",
              meshName: DEMO_MULTI_MACHINE_BEARING_PART_NUMBER,
              qty: 1,
            },
          ],
          unmatched: [],
        },
        {
          id: FIXTURE_MACHINE_IDS.palletizer,
          tenantId: DEFAULT_TENANT_ID,
          storedFileName: "palletizer.glb",
          name: "Palletizer",
          parts: [{ id: "PN-MTR-3301", name: "Gearmotor", meshName: "PN-MTR-3301", qty: 1 }],
          unmatched: [],
        },
      ],
      partLifecycle: [],
    };
    const first = applyDemoTenantB1Migration(seed);
    assert.ok(first.changed);
    assert.ok(first.bearingAddedOnPalletizer);
    assert.equal(first.db.dataMigrations?.demoTenantB1, DEMO_TENANT_DATA_MIGRATION_B1);
    const palletizer = first.db.machines.find((row) => row.id === FIXTURE_MACHINE_IDS.palletizer);
    assert.ok(palletizer?.unmatched?.some((row) => row.id === DEMO_MULTI_MACHINE_BEARING_PART_NUMBER));

    const rows = buildTenantPartCatalog(
      first.db.machines as StoredMachine[],
      [],
      T,
    );
    const bearing = rows.find((row) => row.partNumber === DEMO_MULTI_MACHINE_BEARING_PART_NUMBER);
    assert.ok(bearing);
    assert.equal(bearing.machineIds.length, 2);
    assert.ok(bearing.machineNames.includes("Hardware fixture"));
    assert.ok(bearing.machineNames.includes("Palletizer"));

    const second = applyDemoTenantB1Migration(first.db);
    assert.equal(second.changed, false);
  });

  it("B2 adds four stage quotes on the hardware fixture for demo buyer", () => {
    process.env.SPARES_ALLOW_SEED = "false";
    const seed = {
      users: [
        {
          id: "user-demo-buyer",
          email: DEMO_TENANT_BUYER.email,
          passwordHash: "x",
          role: "customer" as const,
          tenantId: DEFAULT_TENANT_ID,
        },
      ],
      machines: [
        {
          id: FIXTURE_MACHINE_IDS.hardware,
          tenantId: DEFAULT_TENANT_ID,
          storedFileName: "hardware.glb",
          name: "Hardware fixture",
          parts: [
            {
              id: DEMO_MULTI_MACHINE_BEARING_PART_NUMBER,
              name: "Bearing",
              meshName: DEMO_MULTI_MACHINE_BEARING_PART_NUMBER,
              qty: 1,
            },
          ],
          unmatched: [],
        },
      ],
      quotes: [],
      partLifecycle: [],
    };
    const first = applyDemoTenantB2StageQuotesMigration(seed);
    assert.ok(first.changed);
    assert.equal(first.quotesAdded, 4);
    assert.equal(first.db.dataMigrations?.demoTenantB2, DEMO_TENANT_DATA_MIGRATION_B2);
    for (const id of Object.values(DEMO_STAGE_QUOTE_IDS)) {
      assert.ok(first.db.quotes?.some((row) => row.id === id));
    }
    const second = applyDemoTenantB2StageQuotesMigration(first.db);
    assert.equal(second.changed, false);
    assert.equal(second.quotesAdded, 0);
    delete process.env.SPARES_ALLOW_SEED;
  });

  it("heals the Harware fixture machine name typo", async () => {
    const noopPersist = async () => undefined;
    const seed = {
      users: [],
      machines: [
        {
          id: FIXTURE_MACHINE_IDS.hardware,
          storedFileName: "hardware.glb",
          name: "Harware fixture",
        },
      ],
      partLifecycle: [],
    };
    const result = await applyDemoTenantV1Migration(seed, "migration@oee360.com", noopPersist);
    assert.ok(result.changed);
    assert.equal(result.db.machines[0]?.name, "Hardware fixture");
  });
});
