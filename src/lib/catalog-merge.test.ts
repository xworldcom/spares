import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  liveEmailConflict,
  loginRenameConflicts,
  mergeIdLists,
  mergeRowsForWrite,
  mergeUsersForWrite,
} from "./catalog-merge.ts";

const user = (id: string, email: string, deletedAt?: string) => ({
  id,
  email,
  ...(deletedAt ? { deletedAt } : {}),
});

describe("mergeRowsForWrite", () => {
  it("keeps rows a concurrent writer added", () => {
    const latest = [{ id: "a" }, { id: "b" }];
    const next = [{ id: "a" }];
    assert.deepEqual(
      mergeRowsForWrite(latest, next).map((row) => row.id),
      ["a", "b"],
    );
  });

  it("lets the in-flight write update a row it read", () => {
    const merged = mergeRowsForWrite(
      [{ id: "a", name: "OEE360 Host" }],
      [{ id: "a", name: "JMP" }],
    );
    assert.deepEqual(merged, [{ id: "a", name: "JMP" }]);
  });

  it("does not resurrect a row another writer soft-deleted", () => {
    const merged = mergeRowsForWrite(
      [{ id: "a", deletedAt: "2026-09-01T00:00:00.000Z" }],
      [{ id: "a" }],
    );
    assert.equal(merged[0]?.deletedAt, "2026-09-01T00:00:00.000Z");
  });

  it("keeps a soft delete the in-flight write is making", () => {
    const merged = mergeRowsForWrite(
      [{ id: "a" }],
      [{ id: "a", deletedAt: "2026-09-02T00:00:00.000Z" }],
    );
    assert.equal(merged[0]?.deletedAt, "2026-09-02T00:00:00.000Z");
  });

  it("does not resurrect when the in-flight write deleted but blob is stale live", () => {
    const merged = mergeRowsForWrite(
      [{ id: "a" }],
      [{ id: "a", deletedAt: "2026-09-03T00:00:00.000Z" }],
    );
    assert.equal(merged[0]?.deletedAt, "2026-09-03T00:00:00.000Z");
  });
});

describe("mergeUsersForWrite", () => {
  it("preserves a login created by another instance", () => {
    const merged = mergeUsersForWrite(
      [user("kevin", "kevin@huzevka.com"), user("new", "ops@jmp-solutions.test")],
      [user("kevin", "kevin@huzevka.com")],
    );
    assert.deepEqual(merged.map((row) => row.email), [
      "kevin@huzevka.com",
      "ops@jmp-solutions.test",
    ]);
  });

  it("drops the pre-heal twin when a seed login moved to its canonical id", () => {
    const merged = mergeUsersForWrite(
      [user("legacy-uuid", "staff@spares.local")],
      [user("user-staff", "staff@spares.local")],
    );
    assert.deepEqual(merged.map((row) => row.id), ["user-staff"]);
  });

  it("keeps both rows when neither side is the writer's own", () => {
    const merged = mergeUsersForWrite(
      [user("one", "twin@jmp-solutions.test"), user("two", "twin@jmp-solutions.test")],
      [],
    );
    assert.equal(merged.length, 2);
  });

  it("ignores tombstoned rows when looking for twins", () => {
    const merged = mergeUsersForWrite(
      [user("old", "ops@jmp-solutions.test", "2026-09-01T00:00:00.000Z")],
      [user("new", "ops@jmp-solutions.test")],
    );
    assert.deepEqual(merged.map((row) => row.id), ["new", "old"]);
  });
});

describe("liveEmailConflict", () => {
  it("flags another live row with the same address", () => {
    const users = [user("other", "Ops@JMP-Solutions.test")];
    assert.equal(
      liveEmailConflict(users, { id: "mine", email: "ops@jmp-solutions.test" }),
      true,
    );
  });

  it("ignores the row being written and tombstones", () => {
    const users = [
      user("mine", "ops@jmp-solutions.test"),
      user("gone", "ops@jmp-solutions.test", "2026-09-01T00:00:00.000Z"),
    ];
    assert.equal(
      liveEmailConflict(users, { id: "mine", email: "ops@jmp-solutions.test" }),
      false,
    );
  });
});

describe("loginRenameConflicts", () => {
  it("refuses a rename onto an address another live row already holds", () => {
    const latest = [user("kevin", "kevin@huzevka.com"), user("sat", "sat@b.test")];
    const next = [user("sat", "kevin@huzevka.com")];
    const merged = mergeUsersForWrite(latest, next);
    assert.deepEqual(merged.map((row) => row.id), ["sat"]);
    assert.equal(
      loginRenameConflicts(latest, merged, { id: "sat", email: "kevin@huzevka.com" }),
      true,
    );
  });

  it("allows a rename when the address is free", () => {
    const latest = [user("sat", "sat@b.test")];
    const next = [user("sat", "new@b.test")];
    const merged = mergeUsersForWrite(latest, next);
    assert.equal(
      loginRenameConflicts(latest, merged, { id: "sat", email: "new@b.test" }),
      false,
    );
  });
});

describe("mergeIdLists", () => {
  it("unions tombstone lists and stays undefined when both are empty", () => {
    assert.deepEqual(mergeIdLists(["a"], ["b", "a"]), ["a", "b"]);
    assert.equal(mergeIdLists(undefined, []), undefined);
  });
});
