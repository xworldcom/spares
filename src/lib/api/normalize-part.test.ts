import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizePart } from "./normalize-part.ts";

describe("normalizePart", () => {
  it("keeps the lifecycle the API sent so the part sheet can show it", () => {
    const part = normalizePart({
      id: "6331K32",
      name: "Miniature DC motor",
      meshName: "6331K32",
      qty: 1,
      lifecycle: { status: "obsolete", successorPartNumber: "6331K53" },
    });
    assert.equal(part.lifecycle?.status, "obsolete");
    assert.equal(part.lifecycle?.successorPartNumber, "6331K53");
  });

  it("does not invent fields and defaults a missing qty to 1", () => {
    const part = normalizePart({ id: "A", name: "Washer", meshName: "A" } as never);
    assert.deepEqual(part, { id: "A", name: "Washer", meshName: "A", qty: 1 });
  });
});
