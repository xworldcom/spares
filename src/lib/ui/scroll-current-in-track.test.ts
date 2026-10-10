import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { scrollCurrentInTrack } from "./scroll-current-in-track.ts";

const originalWindow = globalThis.window;

afterEach(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
});

test("scrollCurrentInTrack centers the current step on the track", () => {
  const calls: Array<{ left: number; behavior: string }> = [];
  const first = { offsetLeft: 0, offsetWidth: 40 };
  const current = {
    offsetLeft: 200,
    offsetWidth: 40,
    classList: { contains: () => true },
  };
  const track = {
    clientWidth: 120,
    scrollWidth: 400,
    querySelector: () => current,
    querySelectorAll: (sel: string) =>
      sel === ".quote-progress-step" ? [first, current] : [],
    scrollTo: (opts: { left: number; behavior: string }) => {
      calls.push(opts);
    },
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { matchMedia: () => ({ matches: true }) },
  });

  scrollCurrentInTrack(track as unknown as HTMLElement);

  assert.deepEqual(calls, [{ left: 160, behavior: "auto" }]);
});

test("scrollCurrentInTrack pins the first step to scrollLeft 0", () => {
  const calls: Array<{ left: number; behavior: string }> = [];
  const current = {
    offsetLeft: 0,
    offsetWidth: 40,
    classList: { contains: () => true },
  };
  const track = {
    clientWidth: 120,
    scrollWidth: 400,
    querySelector: () => current,
    querySelectorAll: (sel: string) =>
      sel === ".quote-progress-step" ? [current] : [],
    scrollTo: (opts: { left: number; behavior: string }) => {
      calls.push(opts);
    },
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { matchMedia: () => ({ matches: true }) },
  });

  scrollCurrentInTrack(track as unknown as HTMLElement);
  assert.deepEqual(calls, [{ left: 0, behavior: "auto" }]);
});

test("scrollCurrentInTrack no-ops without a current step", () => {
  const calls: unknown[] = [];
  const track = {
    querySelector: () => null,
    scrollTo: (opts: unknown) => {
      calls.push(opts);
    },
  };

  scrollCurrentInTrack(track as unknown as HTMLElement);
  assert.deepEqual(calls, []);
});
