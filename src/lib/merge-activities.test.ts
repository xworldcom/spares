import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeActivitiesById } from "./merge-activities.ts";

describe("mergeActivitiesById", () => {
  it("returns the same array reference when nothing new arrived", () => {
    const current = [{ id: "a", text: "hi" }];
    const result = mergeActivitiesById(current, [{ id: "a", text: "hi" }]);
    assert.equal(result.changed, false);
    assert.equal(result.activities, current);
  });

  it("appends new rows without replacing the prefix", () => {
    const a = { id: "a", text: "one" };
    const b = { id: "b", text: "two" };
    const result = mergeActivitiesById([a], [a, b]);
    assert.equal(result.changed, true);
    assert.equal(result.activities[0], a);
    assert.equal(result.activities[1], b);
  });
});
