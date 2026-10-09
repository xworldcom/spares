import { describe, expect, it } from "vitest";
import { conversationSheetFullHeightPx } from "@/lib/ui/conversation-sheet-viewport";

describe("conversationSheetFullHeightPx", () => {
  it("caps full height with visual viewport smaller than layout", () => {
    const header = document.createElement("header");
    header.className = "spares-header";
    Object.defineProperty(header, "getBoundingClientRect", {
      value: () => ({ bottom: 56, top: 0, height: 56 }),
    });
    document.body.appendChild(header);
    document.documentElement.style.setProperty("--spares-tabbar", "56px");

    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });
    Object.defineProperty(window, "visualViewport", {
      value: {
        offsetTop: 0,
        height: 720,
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      configurable: true,
    });

    const fullH = conversationSheetFullHeightPx();
    expect(fullH).toBeLessThan(844 - 56 - 56);
    expect(fullH).toBeLessThanOrEqual(720 - 56 - 56 - 8);

    document.body.removeChild(header);
  });
});
