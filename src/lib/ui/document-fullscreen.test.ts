import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addFullscreenChangeListener,
  documentFullscreenElement,
} from "./document-fullscreen.ts";

describe("document fullscreen helpers", () => {
  it("reads webkit fullscreen element when standard API is empty", () => {
    const original = globalThis.document;
    const el = { tagName: "DIV" };
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        fullscreenElement: null,
        webkitFullscreenElement: el,
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    });
    assert.equal(documentFullscreenElement(), el);
    Object.defineProperty(globalThis, "document", { configurable: true, value: original });
  });

  it("registers standard and webkit fullscreen change listeners", () => {
    const original = globalThis.document;
    const seen: string[] = [];
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        addEventListener: (type: string) => {
          seen.push(type);
        },
        removeEventListener: (type: string) => {
          seen.push(`-${type}`);
        },
      },
    });
    const remove = addFullscreenChangeListener(() => undefined);
    assert.deepEqual(seen, ["fullscreenchange", "webkitfullscreenchange"]);
    remove();
    assert.deepEqual(seen.slice(2), ["-fullscreenchange", "-webkitfullscreenchange"]);
    Object.defineProperty(globalThis, "document", { configurable: true, value: original });
  });
});
