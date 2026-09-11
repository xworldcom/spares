import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  QUOTE_BADGE_BOUNCE_KEYFRAMES,
  QUOTE_BADGE_BOUNCE_MS,
  QUOTE_BADGE_BOUNCE_REDUCED_KEYFRAMES,
  QUOTE_BADGE_BOUNCE_REDUCED_MS,
  QUOTE_COUNT_BOUNCE_KEYFRAMES,
  boxOnscreen,
  bounceQuoteCount,
  isPaintedStyleChain,
  pickQuoteAddTarget,
  prefersReducedMotion,
  queryQuoteAddTarget,
  rankQuoteTarget,
} from "./quote-feedback.ts";

describe("prefersReducedMotion", () => {
  it("is false when the media query does not match", () => {
    assert.equal(prefersReducedMotion({ matches: false }), false);
  });

  it("is true when the user asked for less motion", () => {
    assert.equal(prefersReducedMotion({ matches: true }), true);
  });

  it("is false when matchMedia is unavailable", () => {
    assert.equal(prefersReducedMotion(null), false);
    assert.equal(prefersReducedMotion(undefined), false);
  });
});

describe("quote add target", () => {
  const viewport = { width: 768, height: 1024 };

  it("ranks the peek count ahead of the chrome badge or handle", () => {
    assert.equal(rankQuoteTarget("count"), 0);
    assert.equal(rankQuoteTarget("badge"), 1);
    assert.equal(rankQuoteTarget("handle"), 2);
    assert.ok(rankQuoteTarget("count") < rankQuoteTarget("badge"));
    assert.ok(rankQuoteTarget("badge") < rankQuoteTarget("handle"));
  });

  it("ignores off-screen and zero-size boxes", () => {
    assert.equal(
      boxOnscreen({ left: 20, top: 20, width: 24, height: 16 }, viewport),
      true,
    );
    assert.equal(
      boxOnscreen({ left: 20, top: 20, width: 1, height: 16 }, viewport),
      false,
    );
    assert.equal(
      boxOnscreen({ left: 20, top: 2000, width: 24, height: 16 }, viewport),
      false,
    );
    assert.equal(
      boxOnscreen({ left: -80, top: 20, width: 24, height: 16 }, viewport),
      false,
    );
  });

  it("picks the peek count when both a chrome badge and count exist", () => {
    const picked = pickQuoteAddTarget(
      [
        {
          kind: "badge",
          box: { left: 640, top: 20, width: 22, height: 18 },
        },
        {
          kind: "count",
          box: { left: 16, top: 900, width: 80, height: 18 },
        },
        {
          kind: "handle",
          box: { left: 360, top: 980, width: 48, height: 6 },
        },
      ],
      viewport,
    );
    assert.equal(picked?.kind, "count");
  });

  it("ignores a badge that still has a box but is not painted (opacity 0 / hidden chip)", () => {
    const picked = pickQuoteAddTarget(
      [
        {
          kind: "badge",
          box: { left: 640, top: 20, width: 22, height: 18 },
          visible: false,
        },
        {
          kind: "count",
          box: { left: 16, top: 900, width: 80, height: 18 },
          visible: true,
        },
      ],
      viewport,
    );
    assert.equal(picked?.kind, "count");
  });

  it("falls back to the chrome badge when the tray count is not painted", () => {
    const picked = pickQuoteAddTarget(
      [
        {
          kind: "badge",
          box: { left: 640, top: 20, width: 22, height: 18 },
          visible: true,
        },
        {
          kind: "count",
          box: { left: 16, top: 900, width: 80, height: 18 },
          visible: false,
        },
      ],
      viewport,
    );
    assert.equal(picked?.kind, "badge");
  });

  it("falls back to the peek count when the chrome badge is off-screen", () => {
    const picked = pickQuoteAddTarget(
      [
        {
          kind: "badge",
          box: { left: 640, top: -40, width: 22, height: 18 },
        },
        {
          kind: "count",
          box: { left: 16, top: 900, width: 80, height: 18 },
        },
      ],
      viewport,
    );
    assert.equal(picked?.kind, "count");
  });

  it("returns null when nothing is on screen", () => {
    assert.equal(
      pickQuoteAddTarget(
        [{ kind: "badge", box: { left: 0, top: 2000, width: 22, height: 18 } }],
        viewport,
      ),
      null,
    );
  });
});

describe("bounce keyframes", () => {
  it("starts and ends at rest so the badge does not stick scaled", () => {
    const first = QUOTE_BADGE_BOUNCE_KEYFRAMES[0];
    const last = QUOTE_BADGE_BOUNCE_KEYFRAMES[QUOTE_BADGE_BOUNCE_KEYFRAMES.length - 1];
    assert.equal(first.transform, "scale(1)");
    assert.equal(last.transform, "scale(1)");
    assert.ok(QUOTE_BADGE_BOUNCE_MS >= 300 && QUOTE_BADGE_BOUNCE_MS <= 500);
    const countLast = QUOTE_COUNT_BOUNCE_KEYFRAMES[QUOTE_COUNT_BOUNCE_KEYFRAMES.length - 1];
    assert.equal(QUOTE_COUNT_BOUNCE_KEYFRAMES[0].transform, "scale(1)");
    assert.equal(countLast.transform, "scale(1)");
    assert.equal(countLast.color, "#4b4f57");
  });

  it("uses filter, not transform, when motion is reduced", () => {
    for (const frame of QUOTE_BADGE_BOUNCE_REDUCED_KEYFRAMES) {
      assert.ok("filter" in frame);
      assert.equal("transform" in frame, false);
    }
    assert.ok(QUOTE_BADGE_BOUNCE_REDUCED_MS < QUOTE_BADGE_BOUNCE_MS);
  });
});

describe("bounceQuoteCount", () => {
  it("plays WAAPI on the real node and leaves no leftover class", () => {
    const frames: unknown[] = [];
    const el = {
      dataset: { quoteTarget: "badge" },
      animate(keyframes: unknown) {
        frames.push(keyframes);
        return {};
      },
      classList: {
        remove() {
          throw new Error("CSS fallback should not run when animate exists");
        },
        add() {
          throw new Error("CSS fallback should not run when animate exists");
        },
      },
    } as unknown as HTMLElement;

    bounceQuoteCount(el, { matches: false });
    assert.equal(frames.length, 1);
    assert.deepEqual(frames[0], [...QUOTE_BADGE_BOUNCE_KEYFRAMES]);
  });

  it("highlights peek/dock count copy instead of only scaling a badge", () => {
    const frames: unknown[] = [];
    const el = {
      dataset: { quoteTarget: "count" },
      animate(keyframes: unknown) {
        frames.push(keyframes);
        return {};
      },
    } as unknown as HTMLElement;

    bounceQuoteCount(el, { matches: false });
    assert.deepEqual(frames[0], [...QUOTE_COUNT_BOUNCE_KEYFRAMES]);
  });

  it("skips the scale bounce when the user prefers reduced motion", () => {
    const seen: Array<{ frames: unknown; duration: number }> = [];
    const el = {
      dataset: { quoteTarget: "count" },
      animate(keyframes: unknown, options: { duration: number }) {
        seen.push({ frames: keyframes, duration: options.duration });
        return {};
      },
    } as unknown as HTMLElement;

    bounceQuoteCount(el, { matches: true });
    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0].frames, [...QUOTE_BADGE_BOUNCE_REDUCED_KEYFRAMES]);
    assert.equal(seen[0].duration, QUOTE_BADGE_BOUNCE_REDUCED_MS);
  });

  it("falls back to the CSS bounce class when WAAPI is missing", () => {
    const classes = new Set<string>();
    const listeners: Array<(event: AnimationEvent) => void> = [];
    const el = {
      classList: {
        remove(name: string) {
          classes.delete(name);
        },
        add(name: string) {
          classes.add(name);
        },
      },
      addEventListener(_name: string, handler: (event: AnimationEvent) => void) {
        listeners.push(handler);
      },
      removeEventListener() {
        listeners.length = 0;
      },
    } as unknown as HTMLElement;

    bounceQuoteCount(el);
    assert.deepEqual([...classes], ["quote-badge-bounce"]);
    assert.equal(listeners.length, 1);
    listeners[0]({ target: el } as unknown as AnimationEvent);
    assert.deepEqual([...classes], []);
  });
});

describe("painted style chain", () => {
  it("treats opacity 0 or visibility hidden as not painted", () => {
    assert.equal(
      isPaintedStyleChain([
        { display: "inline-block", visibility: "visible", opacity: 1 },
      ]),
      true,
    );
    assert.equal(
      isPaintedStyleChain([
        { display: "inline-block", visibility: "visible", opacity: 1 },
        { display: "flex", visibility: "visible", opacity: 0 },
      ]),
      false,
    );
    assert.equal(
      isPaintedStyleChain([
        { display: "none", visibility: "visible", opacity: 1 },
      ]),
      false,
    );
  });
});

describe("queryQuoteAddTarget", () => {
  it("returns null without a document or viewport", () => {
    assert.equal(queryQuoteAddTarget(null, { width: 768, height: 1024 }), null);
    assert.equal(queryQuoteAddTarget({ querySelectorAll() { return []; } } as unknown as ParentNode, null), null);
  });
});
