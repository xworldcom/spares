import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { createFakeVercelBlob } from "./fake-vercel-blob.ts";
import {
  createBlobPersistence,
  createMemoryPersistence,
  setPersistenceForTests,
  type BlobClient,
  type CatalogDocument,
  type Persistence,
} from "./persistence.ts";

const fakeBlob = () => createFakeVercelBlob({ edgeEtag: "same" });

const docs: CatalogDocument[] = ["database", "care"];

async function exerciseConditionalWrites(persistence: Persistence) {
  for (const doc of docs) {
    const missing = await persistence.readVersioned(doc);
    assert.deepEqual(missing, { json: null, version: null });

    const created = await persistence.writeIfVersion(doc, '{"n":1}', null);
    assert.ok(created.ok, `${doc}: create when absent`);
    const again = await persistence.writeIfVersion(doc, '{"n":99}', null);
    assert.equal(again.ok, false, `${doc}: create-only must not overwrite an existing document`);

    const first = await persistence.readVersioned(doc);
    assert.equal(first.json, '{"n":1}');
    assert.equal(first.version, created.ok ? created.version : "?");

    const second = await persistence.writeIfVersion(doc, '{"n":2}', first.version);
    assert.ok(second.ok, `${doc}: write with the version that was read`);
    const stale = await persistence.writeIfVersion(doc, '{"n":3}', first.version);
    assert.equal(stale.ok, false, `${doc}: a stale version must be rejected`);

    const latest = await persistence.readVersioned(doc);
    assert.equal(latest.json, '{"n":2}', `${doc}: the rejected write changed nothing`);
    assert.notEqual(latest.version, first.version);
  }
}

describe("conditional (compare-and-swap) catalog writes", () => {
  after(() => {
    setPersistenceForTests(null);
    delete process.env.SPARES_DATA_DIR;
  });

  it("memory backend", async () => {
    await exerciseConditionalWrites(createMemoryPersistence());
  });

  for (const edgeEtag of ["same", "weak", "edge"] as const) {
    it(`Vercel Blob backend maps ETag / ifMatch / allowOverwrite (edge ETag: ${edgeEtag})`, async () => {
      const { client } = createFakeVercelBlob({ edgeEtag });
      await exerciseConditionalWrites(createBlobPersistence(client));
    });
  }

  it("Blob: sends ifMatch with the ETag that was read and never overwrites blindly", async () => {
    const { client } = fakeBlob();
    const calls: Array<Record<string, unknown>> = [];
    const spying: BlobClient = {
      ...client,
      async put(pathname, body, options) {
        calls.push(options);
        return client.put(pathname, body, options);
      },
    };
    const persistence = createBlobPersistence(spying);
    await persistence.writeIfVersion("database", "{}", null);
    const read = await persistence.readVersioned("database");
    await persistence.writeIfVersion("database", '{"a":1}', read.version);
    assert.equal(calls[0].allowOverwrite, false);
    assert.equal(calls[0].ifMatch, undefined);
    assert.equal(calls[1].ifMatch, read.version);
    assert.equal(calls[1].allowOverwrite, true);
  });

  it("local fs backend: stale versions rejected, no temp or lock files left behind", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "spares-cas-fs-"));
    process.env.SPARES_DATA_DIR = dir;
    setPersistenceForTests(null);
    const { getPersistence } = await import("./persistence.ts");
    const persistence = getPersistence();
    assert.equal(persistence.kind, "fs");
    await exerciseConditionalWrites(persistence);
    const left = (await readdir(dir)).filter((name) => /\.(tmp|lock)$/.test(name));
    assert.deepEqual(left, []);
  });

  it("exactly one of many racing writers wins each version (fs)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "spares-cas-race-"));
    process.env.SPARES_DATA_DIR = dir;
    setPersistenceForTests(null);
    const { getPersistence } = await import("./persistence.ts");
    const persistence = getPersistence();
    await persistence.writeIfVersion("database", '{"n":0}', null);
    const { version } = await persistence.readVersioned("database");
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        persistence.writeIfVersion("database", `{"writer":${i}}`, version),
      ),
    );
    assert.equal(results.filter((result) => result.ok).length, 1);
  });
});
