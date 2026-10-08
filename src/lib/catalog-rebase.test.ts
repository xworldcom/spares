import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rebaseCatalog } from "./catalog-rebase.ts";

type Row = { id: string; [key: string]: unknown };
type Doc = {
  users: Row[];
  machines: Row[];
  machineUsage?: Array<{ machineId: string; hours?: number }>;
  orgTombstones?: { customerIds?: string[] };
  dataMigrations?: { demoTenantV1?: number };
};

describe("rebaseCatalog: re-apply a mutation on the latest copy", () => {
  it("keeps a field another writer changed when the mutation did not touch it", () => {
    const base: Doc = { users: [{ id: "u", name: "A", machineIds: [] }], machines: [] };
    const next: Doc = { users: [{ id: "u", name: "B", machineIds: [] }], machines: [] };
    const latest: Doc = { users: [{ id: "u", name: "A", machineIds: ["hw"] }], machines: [] };
    const merged = rebaseCatalog(base, next, latest);
    assert.deepEqual(merged.users, [{ id: "u", name: "B", machineIds: ["hw"] }]);
  });

  it("keeps rows only the other writer knows about and adds this writer's new rows", () => {
    const base: Doc = { users: [], machines: [{ id: "m1" }] };
    const next: Doc = { users: [], machines: [{ id: "m1" }, { id: "mine" }] };
    const latest: Doc = { users: [], machines: [{ id: "m1" }, { id: "theirs" }] };
    assert.deepEqual(
      rebaseCatalog(base, next, latest).machines.map((row) => row.id).sort(),
      ["m1", "mine", "theirs"],
    );
  });

  it("applies this writer's deletes and respects the other writer's deletes", () => {
    const base: Doc = { users: [], machines: [{ id: "a" }, { id: "b" }, { id: "c" }] };
    const next: Doc = { users: [], machines: [{ id: "a" }, { id: "b", edited: true }] };
    const latest: Doc = { users: [], machines: [{ id: "b" }, { id: "c" }] };
    // "c" deleted by us, "a" deleted by them, "b" edited by us and kept by them.
    assert.deepEqual(rebaseCatalog(base, next, latest).machines, [{ id: "b", edited: true }]);
  });

  it("merges primitive lists as sets (grants, tombstones)", () => {
    const base: Doc = { users: [{ id: "u", machineIds: ["x"] }], machines: [], orgTombstones: { customerIds: ["c1"] } };
    const next: Doc = {
      users: [{ id: "u", machineIds: ["x", "mine"] }],
      machines: [],
      orgTombstones: { customerIds: ["c1", "c2"] },
    };
    const latest: Doc = {
      users: [{ id: "u", machineIds: ["x", "theirs"] }],
      machines: [],
      orgTombstones: { customerIds: ["c1", "c3"] },
    };
    const merged = rebaseCatalog(base, next, latest);
    assert.deepEqual([...(merged.users[0].machineIds as string[])].sort(), ["mine", "theirs", "x"]);
    assert.deepEqual([...(merged.orgTombstones!.customerIds!)].sort(), ["c1", "c2", "c3"]);
  });

  it("keys machine usage by machineId", () => {
    const base: Doc = { users: [], machines: [], machineUsage: [{ machineId: "m1", hours: 1 }] };
    const next: Doc = { users: [], machines: [], machineUsage: [{ machineId: "m1", hours: 5 }] };
    const latest: Doc = {
      users: [],
      machines: [],
      machineUsage: [{ machineId: "m1", hours: 1 }, { machineId: "m2", hours: 9 }],
    };
    assert.deepEqual(rebaseCatalog(base, next, latest).machineUsage, [
      { machineId: "m1", hours: 5 },
      { machineId: "m2", hours: 9 },
    ]);
  });

  it("returns the latest copy untouched when the mutation changed nothing", () => {
    const base: Doc = { users: [{ id: "u", name: "A" }], machines: [] };
    const latest: Doc = { users: [{ id: "u", name: "A", machineIds: ["hw"] }], machines: [], dataMigrations: { demoTenantV1: 1 } };
    assert.deepEqual(rebaseCatalog(base, structuredClone(base), latest), latest);
  });
});
