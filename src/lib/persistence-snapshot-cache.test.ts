import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFakeVercelBlob } from "./fake-vercel-blob.ts";
import { createBlobPersistence } from "./persistence.ts";
import { resetBlobReadBytes, getBlobReadBytes } from "./blob-read-bytes.ts";

describe("blob snapshot reads", () => {
  it("reuses catalog JSON when HEAD etag is unchanged (weak edge etag)", async () => {
    const blob = createFakeVercelBlob({ edgeEtag: "weak" });
    const persistence = createBlobPersistence(blob.client);
    await persistence.writeIfVersion("database", '{"n":1}', null);

    resetBlobReadBytes();
    const first = await persistence.readVersioned("database", "snapshot");
    const afterFirst = getBlobReadBytes();
    assert.ok(afterFirst > 0);

    resetBlobReadBytes();
    const second = await persistence.readVersioned("database", "snapshot");
    assert.equal(getBlobReadBytes(), 0, "second snapshot read should not download body");
    assert.equal(second.json, first.json);
    assert.equal(second.version, first.version);
    assert.equal(blob.calls.get, 1, "only one blob GET for repeated snapshot reads");
  });
});
