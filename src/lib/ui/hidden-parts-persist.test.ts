import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  hiddenPartsStorageKey,
  pruneHiddenParts,
  readPersistedHiddenParts,
  writePersistedHiddenParts,
} from "./hidden-parts-persist.ts";

const store = new Map<string, string>();
Object.assign(globalThis, {
  window: {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  },
});

describe("hidden parts persistence", () => {
  const key = hiddenPartsStorageKey("tenant-a", "machine-b");
  beforeEach(() => store.clear());

  it("is scoped per tenant and machine", () => {
    assert.notEqual(key, hiddenPartsStorageKey("tenant-a", "machine-c"));
    assert.notEqual(key, hiddenPartsStorageKey("tenant-z", "machine-b"));
  });

  it("round-trips and removes the key when empty", () => {
    writePersistedHiddenParts(key, ["A", "B"]);
    assert.deepEqual(readPersistedHiddenParts(key), ["A", "B"]);
    writePersistedHiddenParts(key, []);
    assert.equal(store.get(key), undefined);
  });

  it("ignores corrupt storage and dedupes", () => {
    store.set(key, "{nope");
    assert.deepEqual(readPersistedHiddenParts(key), []);
    store.set(key, JSON.stringify(["A", "A", "", 3, "B"]));
    assert.deepEqual(readPersistedHiddenParts(key), ["A", "B"]);
  });

  it("prunes ids the machine no longer has", () => {
    assert.deepEqual(pruneHiddenParts(["A", "gone"], [{ id: "A" }, { id: "B" }]), ["A"]);
  });
});
