import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SPARES_VV_BOTTOM_VAR,
  applyVisualViewportBottom,
  scheduleVisualViewportSync,
  subscribeVisualViewport,
  syncVisualViewportBottom,
  visualViewportBottomInset,
} from "./visual-viewport.ts";

describe("visualViewportBottomInset", () => {
  it("is zero without a visual viewport", () => {
    assert.equal(visualViewportBottomInset(800, null), 0);
    assert.equal(visualViewportBottomInset(800, undefined), 0);
  });

  it("is zero when Safari chrome is minimized", () => {
    assert.equal(
      visualViewportBottomInset(800, { height: 800, offsetTop: 0 }),
      0,
    );
  });

  it("lifts by the covered bottom when Safari chrome expands", () => {
    assert.equal(
      visualViewportBottomInset(800, { height: 700, offsetTop: 0 }),
      100,
    );
  });

  it("ignores top chrome already represented by offsetTop", () => {
    assert.equal(
      visualViewportBottomInset(800, { height: 700, offsetTop: 100 }),
      0,
    );
  });

  it("splits top offset from remaining bottom chrome", () => {
    assert.equal(
      visualViewportBottomInset(800, { height: 650, offsetTop: 50 }),
      100,
    );
  });

  it("never returns a negative inset", () => {
    assert.equal(
      visualViewportBottomInset(700, { height: 800, offsetTop: 0 }),
      0,
    );
  });
});

describe("syncVisualViewportBottom", () => {
  it("writes the CSS variable in pixels", () => {
    const set = new Map<string, string>();
    syncVisualViewportBottom(
      { style: { setProperty: (name, value) => set.set(name, value) } },
      800,
      { height: 708, offsetTop: 0 },
    );
    assert.equal(set.get(SPARES_VV_BOTTOM_VAR), "92px");
  });

  it("clears the inset when chrome is gone", () => {
    const set = new Map<string, string>();
    applyVisualViewportBottom(
      { setProperty: (name, value) => set.set(name, value) },
      0,
    );
    assert.equal(set.get(SPARES_VV_BOTTOM_VAR), "0px");
  });
});

describe("subscribeVisualViewport", () => {
  it("listens to resize, scroll, pageshow, and visibilitychange", () => {
    const added: string[] = [];
    const removed: string[] = [];
    const vvAdded: string[] = [];
    const vvRemoved: string[] = [];
    let calls = 0;

    const view = {
      visualViewport: {
        addEventListener(type: string) {
          vvAdded.push(type);
        },
        removeEventListener(type: string) {
          vvRemoved.push(type);
        },
      },
      addEventListener(type: string) {
        added.push(type);
      },
      removeEventListener(type: string) {
        removed.push(type);
      },
      document: {
        addEventListener(type: string) {
          added.push(`document:${type}`);
        },
        removeEventListener(type: string) {
          removed.push(`document:${type}`);
        },
      },
    };

    const stop = subscribeVisualViewport(() => {
      calls += 1;
    }, view);
    assert.equal(calls, 1);
    assert.deepEqual(vvAdded, ["resize", "scroll"]);
    assert.ok(added.includes("resize"));
    assert.ok(added.includes("pageshow"));
    assert.ok(added.includes("document:visibilitychange"));

    stop();
    assert.deepEqual(vvRemoved, ["resize", "scroll"]);
    assert.ok(removed.includes("pageshow"));
    assert.ok(removed.includes("document:visibilitychange"));
  });
});

describe("scheduleVisualViewportSync", () => {
  it("runs immediately even without animation frames", () => {
    let n = 0;
    const previous = globalThis.requestAnimationFrame;
    // @ts-expect-error -- test stub
    globalThis.requestAnimationFrame = undefined;
    try {
      scheduleVisualViewportSync(() => {
        n += 1;
      });
    } finally {
      globalThis.requestAnimationFrame = previous;
    }
    assert.equal(n, 1);
  });
});

describe("bottom chrome offsets", () => {
  it("does not add a second safe-area on top of --spares-tabbar", async () => {
    const { readFile } = await import("node:fs/promises");
    const css = await readFile(new URL("../../app/globals.css", import.meta.url), "utf8");
    const workspace = await readFile(
      new URL("../../components/quote/QuoteWorkspace.tsx", import.meta.url),
      "utf8",
    );
    const tabbar = await readFile(
      new URL("../../components/nav/MobileTabBar.tsx", import.meta.url),
      "utf8",
    );
    assert.equal(css.includes("var(--spares-tabbar) + env(safe-area-inset-bottom"), false);
    assert.equal(workspace.includes("sticky z-20"), false);
    assert.match(workspace, /quote-staff-apply/);
    assert.equal(tabbar.includes("env(safe-area-inset-bottom)"), false);
  });
});
