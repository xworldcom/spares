import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTapGesture, tapActivateHandlers } from "./tap-gesture.ts";

describe("tapActivateHandlers", () => {
  it("fires onTap for a clean tap", () => {
    const gesture = createTapGesture();
    let taps = 0;
    const handlers = tapActivateHandlers(gesture, () => {
      taps += 1;
    });

    handlers.onPointerDown({
      button: 0,
      clientX: 10,
      clientY: 20,
      pointerId: 1,
    } as React.PointerEvent<HTMLElement>);

    handlers.onPointerUp({
      clientX: 11,
      clientY: 21,
      pointerId: 1,
    } as React.PointerEvent<HTMLElement>);

    assert.equal(taps, 1);
  });

  it("ignores movement past slop", () => {
    const gesture = createTapGesture();
    let taps = 0;
    const handlers = tapActivateHandlers(gesture, () => {
      taps += 1;
    });

    handlers.onPointerDown({
      button: 0,
      clientX: 10,
      clientY: 20,
      pointerId: 1,
    } as React.PointerEvent<HTMLElement>);

    handlers.onPointerMove({
      clientX: 20,
      clientY: 20,
      pointerId: 1,
    } as React.PointerEvent<HTMLElement>);

    handlers.onPointerUp({
      clientX: 20,
      clientY: 20,
      pointerId: 1,
    } as React.PointerEvent<HTMLElement>);

    assert.equal(taps, 0);
  });
});
