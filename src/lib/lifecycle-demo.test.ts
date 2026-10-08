import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { setPersistenceForTests } from "./persistence.ts";
import { FIXTURE_MACHINE_IDS } from "./seed-fixtures.ts";
import {
  ensureLifecycleDemoFixtures,
  getMachine,
  listMachines,
  listTenantPartLifecycleCatalog,
  resetStoreMemoryForTests,
  upsertTenantPartLifecycle,
} from "./store.ts";
import { DEFAULT_TENANT_ID } from "./tenant.ts";

const T = DEFAULT_TENANT_ID;
const previousSeed = process.env.SPARES_ALLOW_SEED;

async function productionLikeStore() {
  process.env.SPARES_ALLOW_SEED = "false";
  const dir = await mkdtemp(path.join(tmpdir(), "spares-lifecycle-demo-"));
  process.env.SPARES_DATA_DIR = dir;
  setPersistenceForTests(null);
  await mkdir(path.join(dir, "files"), { recursive: true });
  resetStoreMemoryForTests();
}

after(() => {
  if (previousSeed === undefined) {
    delete process.env.SPARES_ALLOW_SEED;
  } else {
    process.env.SPARES_ALLOW_SEED = previousSeed;
  }
});

describe("ensureLifecycleDemoFixtures (SPARES_ALLOW_SEED off)", () => {
  it("auto-migrates on first catalog read without staff POST", async () => {
    await productionLikeStore();
    await listMachines(T);
    assert.ok(await getMachine(FIXTURE_MACHINE_IDS.hardware, T));
  });

  it("staff POST path stays idempotent after auto migration", async () => {
    await productionLikeStore();
    await listMachines(T);
    const second = await ensureLifecycleDemoFixtures(T, "owner@example.test");
    assert.deepEqual(second, {
      status: "ok",
      machineId: FIXTURE_MACHINE_IDS.hardware,
      machineCreated: false,
      lifecycleAdded: [],
    });
  });

  it("never overwrites lifecycle a staff member already edited", async () => {
    await productionLikeStore();
    await upsertTenantPartLifecycle(
      T,
      [{ partNumber: "6331K32", patch: { status: "active" } }],
      "staff@example.test",
    );
    await ensureLifecycleDemoFixtures(T, "owner@example.test");
    const rows = await listTenantPartLifecycleCatalog(T, { status: "all" });
    const edited = rows.find((row) => row.partNumber === "6331K32");
    assert.equal(edited?.lifecycle.status, "active");
  });

  it("refuses other tenants", async () => {
    await productionLikeStore();
    assert.deepEqual(await ensureLifecycleDemoFixtures("tenant-other", "x@y.test"), {
      status: "wrong_tenant",
    });
  });
});
