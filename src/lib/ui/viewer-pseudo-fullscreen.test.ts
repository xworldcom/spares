import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prefersViewerOverlayFullscreen, viewerOverlayFramePx } from "./viewer-pseudo-fullscreen.ts";

describe("viewer pseudo-fullscreen", () => {
  it("detects iOS user agents", () => {
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" },
    });
    assert.equal(prefersViewerOverlayFullscreen(), true);
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: original });
  });

  it("returns a positive height from the visual viewport", () => {
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        innerHeight: 800,
        visualViewport: { offsetTop: 0, height: 700, addEventListener: () => {}, removeEventListener: () => {} },
      },
    });
    const frame = viewerOverlayFramePx();
    assert.ok(frame.heightPx >= 200);
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  });
});
