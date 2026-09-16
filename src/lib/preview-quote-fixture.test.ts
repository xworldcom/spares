import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { FIXTURE_MACHINE_IDS } from "./seed-fixtures.ts";
import { createMemoryPersistence, setPersistenceForTests } from "./persistence.ts";
import { DEFAULT_TENANT_ID } from "./tenant.ts";
import {
  ensurePreviewQaQuoteFixture,
  listMachines,
  listQuotes,
  PREVIEW_QA_QUOTE_ID,
  resetStoreMemoryForTests,
} from "./store.ts";

const T = DEFAULT_TENANT_ID;

async function previewStore() {
  const dir = await mkdtemp(path.join(tmpdir(), "spares-preview-quote-"));
  process.env.SPARES_DATA_DIR = dir;
  process.env.SPARES_ALLOW_SEED = "true";
  delete process.env.VERCEL;
  setPersistenceForTests(createMemoryPersistence());
  await mkdir(path.join(dir, "files"), { recursive: true });
  resetStoreMemoryForTests();
  return dir;
}

describe("ensurePreviewQaQuoteFixture", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_DATA_DIR;
    delete process.env.SPARES_ALLOW_SEED;
  });

  it("creates a stable host quote once and reuses it", async () => {
    await previewStore();
    await listMachines(T);

    const first = await ensurePreviewQaQuoteFixture(T);
    assert.equal(first.status, "created");
    assert.equal(first.quote.id, PREVIEW_QA_QUOTE_ID);
    assert.equal(first.quote.machineId, FIXTURE_MACHINE_IDS.hardware);
    assert.ok(first.quote.activities.length >= 2);

    const second = await ensurePreviewQaQuoteFixture(T);
    assert.equal(second.status, "exists");
    assert.equal(second.quote.id, PREVIEW_QA_QUOTE_ID);

    const listed = await listQuotes(T);
    assert.equal(listed.filter((row) => row.id === PREVIEW_QA_QUOTE_ID).length, 1);
  });

  it("is disabled when seeds are off", async () => {
    await previewStore();
    process.env.SPARES_ALLOW_SEED = "false";
    resetStoreMemoryForTests();
    const result = await ensurePreviewQaQuoteFixture(T);
    assert.equal(result.status, "disabled");
  });
});
