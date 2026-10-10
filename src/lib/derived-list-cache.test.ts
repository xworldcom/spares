import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NextRequest } from "next/server";
import {
  catalogVersionKey,
  clearDerivedListCachesForTests,
  respondDerivedList,
} from "./derived-list-cache.ts";
import { createMemoryPersistence, setPersistenceForTests } from "./persistence.ts";

describe("derived list cache", () => {
  it("returns 304 when If-None-Match matches catalog-gated etag", async () => {
    setPersistenceForTests(createMemoryPersistence());
    clearDerivedListCachesForTests();
    const scope = "tenant:t1:user:u1:quotes";
    const req = new NextRequest("http://localhost/api/quotes");
    const first = await respondDerivedList(req, scope, async () => ({ quotes: [], unreadCount: 0 }));
    assert.equal(first.status, 200);
    const etag = first.headers.get("etag");
    assert.ok(etag);

    const secondReq = new NextRequest("http://localhost/api/quotes", {
      headers: { "if-none-match": etag! },
    });
    const second = await respondDerivedList(secondReq, scope, async () => {
      throw new Error("build should not run");
    });
    assert.equal(second.status, 304);
    assert.equal(second.headers.get("etag"), etag);

    const catalogKey = await catalogVersionKey();
    const third = await respondDerivedList(
      new NextRequest("http://localhost/api/quotes"),
      `${scope}:other`,
      async () => ({ quotes: [{ id: "q1" }], unreadCount: 1 }),
    );
    assert.equal(third.status, 200);
    assert.notEqual(third.headers.get("etag"), etag);
    assert.ok(catalogKey);
  });
});
