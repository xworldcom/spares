import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildViewerAssemblyKey,
  shouldForwardViewerFitKey,
} from "./viewerCameraFit.ts";

describe("buildViewerAssemblyKey", () => {
  it("tracks hide/isolate only (not selection or explode)", () => {
    const base = buildViewerAssemblyKey([], null);
    assert.equal(base, "|");
    assert.equal(buildViewerAssemblyKey(["a", "b"], null), "a\u0000b|");
    assert.equal(buildViewerAssemblyKey([], "part-1"), "|part-1");
    assert.equal(
      buildViewerAssemblyKey(["x"], "y"),
      buildViewerAssemblyKey(["x"], "y"),
    );
  });
});

describe("shouldForwardViewerFitKey", () => {
  it("suppresses fitKey bumps right after explode changes", () => {
    assert.equal(shouldForwardViewerFitKey(0), false);
    assert.equal(shouldForwardViewerFitKey(50), false);
    assert.equal(shouldForwardViewerFitKey(399), false);
    assert.equal(shouldForwardViewerFitKey(400), true);
    assert.equal(shouldForwardViewerFitKey(5_000), true);
  });

  it("would fail if explode slider refit were always forwarded", () => {
    assert.equal(shouldForwardViewerFitKey(120), false);
  });
});
