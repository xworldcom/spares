import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import {
  DEMO_TENANT_BUYER,
  DEMO_TENANT_DATA_MIGRATION_V1,
  applyDemoTenantV1Migration,
} from "./demo-tenant-data-migration.ts";
import { setPersistenceForTests } from "./persistence.ts";
import { FIXTURE_MACHINE_IDS } from "./seed-fixtures.ts";
import { verifyPassword } from "./auth/password.ts";
import {
  findUserByEmail,
  getMachine,
  listMachines,
  listTenantPartLifecycleCatalog,
  resetStoreMemoryForTests,
} from "./store.ts";
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

    const second = await applyDemoTenantV1Migration(first.db, "migration@oee360.com", noopPersist);
    assert.equal(second.changed, false);
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

  it("creates demo buyer grant for user@demo.com", async () => {
    await productionLikeStore();
    await listMachines(T);
    const buyer = await findUserByEmail(DEMO_TENANT_BUYER.email);
    assert.ok(buyer);
    assert.ok(buyer.machineIds?.includes(FIXTURE_MACHINE_IDS.hardware));
    assert.ok(await verifyPassword(DEMO_TENANT_BUYER.password, buyer.passwordHash));
  });
});
