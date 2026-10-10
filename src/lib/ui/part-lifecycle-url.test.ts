import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  partLifecycleFiltersFromSearch,
  staffPartLifecycleHref,
} from "./part-lifecycle-url.ts";

describe("partLifecycleFiltersFromSearch", () => {
  it("defaults missing params", () => {
    const filters = partLifecycleFiltersFromSearch(new URLSearchParams());
    assert.equal(filters.status, "all");
    assert.equal(filters.machineId, "");
    assert.equal(filters.q, "");
  });

  it("round-trips status, machine, and q", () => {
    const filters = partLifecycleFiltersFromSearch(
      new URLSearchParams("status=obsolete&machine=m1&q=bearing"),
    );
    assert.equal(filters.status, "obsolete");
    assert.equal(filters.machineId, "m1");
    assert.equal(filters.q, "bearing");
    assert.equal(
      staffPartLifecycleHref(filters),
      "/staff/parts?status=obsolete&machine=m1&q=bearing",
    );
  });

  it("ignores invalid status", () => {
    const filters = partLifecycleFiltersFromSearch(
      new URLSearchParams("status=not-a-status"),
    );
    assert.equal(filters.status, "all");
  });
});
