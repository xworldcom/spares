import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { createFakeVercelBlob } from "./fake-vercel-blob.ts";
import { createBlobPersistence, setPersistenceForTests } from "./persistence.ts";
import { listMachines, resetStoreMemoryForTests } from "./store.ts";

describe("in-process catalog memory", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
  });

  it("reuses memory across readDatabase when peek etag matches API etag", async () => {
    const blob = createFakeVercelBlob({ edgeEtag: "weak" });
    const persistence = createBlobPersistence(blob.client);
    setPersistenceForTests(persistence);
    resetStoreMemoryForTests();
    await persistence.writeIfVersion(
      "database",
      JSON.stringify({
        schemaVersion: 1,
        users: [],
        machines: [],
        quotes: [],
        tickets: [],
        customers: [],
        sites: [],
        tenants: [],
      }),
      null,
    );
    await persistence.writeIfVersion("care", '{"tickets":[]}', null);

    await listMachines("tenant-demo");
    const getsAfterWarm = blob.calls.get;

    await listMachines("tenant-demo");
    assert.equal(blob.calls.get, getsAfterWarm, "warm catalog should not re-download blobs");
  });
});
