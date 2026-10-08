import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assemblyCentroid,
  explodeTranslation,
  explodeTravel,
  ISOLATE_OPACITY,
  isGhosted,
  meshIsolateState,
  viewerNeedsShowAll,
} from "./assemblyView.ts";

describe("explodeTranslation", () => {
  const centroid = { x: 0, y: 0, z: 0 };

  it("is a no-op at amount 0", () => {
    assert.deepEqual(
      explodeTranslation({ x: 2, y: 0, z: 0 }, centroid, 0, 1),
      { x: 0, y: 0, z: 0 },
    );
  });

  it("moves radially away from the centroid", () => {
    const offset = explodeTranslation({ x: 2, y: 0, z: 0 }, centroid, 1, 1);
    assert.ok(offset.x > 0);
    assert.equal(offset.y, 0);
    assert.equal(offset.z, 0);
    assert.ok(Math.abs(offset.x - 1) < 1e-9);
  });

  it("scales smoothly with amount", () => {
    const half = explodeTranslation({ x: 0, y: 4, z: 0 }, centroid, 0.5, 2);
    const full = explodeTranslation({ x: 0, y: 4, z: 0 }, centroid, 1, 2);
    assert.ok(Math.abs(half.y * 2 - full.y) < 1e-9);
    assert.ok(full.y > half.y);
  });
});

describe("assembly helpers", () => {
  it("averages centers and reports a reset when exploded, hidden, or isolated", () => {
    assert.deepEqual(
      assemblyCentroid([
        { x: 0, y: 0, z: 0 },
        { x: 2, y: 4, z: 6 },
      ]),
      { x: 1, y: 2, z: 3 },
    );
    assert.ok(explodeTravel([{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }]) > 1);
    assert.equal(ISOLATE_OPACITY, 0.12);
    assert.equal(isGhosted("A", "B"), true);
    assert.equal(isGhosted("A", "A"), false);
    assert.equal(isGhosted("A", null), false);
    assert.deepEqual(meshIsolateState("A", "B", new Set()), {
      hidden: false,
      ghosted: true,
      pickable: false,
    });
    assert.deepEqual(meshIsolateState("A", "A", new Set()), {
      hidden: false,
      ghosted: false,
      pickable: true,
    });
    assert.deepEqual(meshIsolateState(null, "A", new Set()), {
      hidden: false,
      ghosted: true,
      pickable: false,
    });
    assert.deepEqual(meshIsolateState("A", "B", new Set(["A"])), {
      hidden: true,
      ghosted: false,
      pickable: false,
    });
    assert.equal(viewerNeedsShowAll([]), false);
    assert.equal(viewerNeedsShowAll(["A"]), true);
  });
});
