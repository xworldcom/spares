import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { viewerAssemblyCameraKey } from "./viewerAssemblyKey.ts";

describe("viewerAssemblyCameraKey", () => {
  it("changes when hidden or isolated parts change", () => {
    const base = viewerAssemblyCameraKey([], null);
    assert.notEqual(viewerAssemblyCameraKey(["a"], null), base);
    assert.notEqual(viewerAssemblyCameraKey([], "a"), base);
  });

  it("does not encode part selection (#433)", () => {
    assert.equal(viewerAssemblyCameraKey([], null).split("|").length, 2);
    assert.equal(
      viewerAssemblyCameraKey(["6331K32"], null),
      viewerAssemblyCameraKey(["6331K32"], null),
    );
  });
});
