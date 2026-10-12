import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  partLifecycleFiltersFromSearch,
  staffPartLifecycleHref,
  staffPartLifecycleViewHref,
  machinePartViewHref,
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

  it("builds view-part deep links", () => {
    assert.equal(
      staffPartLifecycleViewHref("6331K32"),
      "/staff/parts?q=6331K32&highlight=6331K32",
    );
    assert.equal(
      machinePartViewHref("m1", "6331K32"),
      "/machines/m1?part=6331K32",
    );
  });

  it("ignores invalid status", () => {
    const filters = partLifecycleFiltersFromSearch(
      new URLSearchParams("status=not-a-status"),
    );
    assert.equal(filters.status, "all");
  });
});
