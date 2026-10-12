import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { entityShardsEnabled } from "./entity-record-store.ts";

describe("entityShardsEnabled", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it("is off on managed runtime unless SPARES_ENTITY_SHARDS=1", () => {
    process.env.VERCEL = "1";
    delete process.env.SPARES_ENTITY_SHARDS;
    assert.equal(entityShardsEnabled({ dataMigrations: { entityShardsV1: 1 } }), false);
    process.env.SPARES_ENTITY_SHARDS = "1";
    assert.equal(entityShardsEnabled({ dataMigrations: { entityShardsV1: 1 } }), true);
  });

  it("follows catalog flag locally", () => {
    delete process.env.VERCEL;
    assert.equal(entityShardsEnabled({ dataMigrations: { entityShardsV1: 0 } }), false);
    assert.equal(entityShardsEnabled({ dataMigrations: { entityShardsV1: 1 } }), true);
  });
});
