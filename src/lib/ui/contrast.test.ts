import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contrastRatio, SPARES_TONES } from "./contrast.ts";

const AA_NORMAL = 4.5;
const AA_LARGE = 3;

describe("customer action tokens", () => {
  it("uses dark text on the light primary fill", () => {
    assert.ok(contrastRatio(SPARES_TONES.onInk, SPARES_TONES.ink) >= AA_NORMAL);
  });

  it("uses light text on paper, lift, and soft fills", () => {
    assert.ok(contrastRatio(SPARES_TONES.onPaper, SPARES_TONES.paper) >= AA_NORMAL);
    assert.ok(contrastRatio(SPARES_TONES.onPaper, SPARES_TONES.lift) >= AA_NORMAL);
    assert.ok(contrastRatio(SPARES_TONES.onPaper, SPARES_TONES.soft) >= AA_NORMAL);
  });

  it("keeps muted labels readable on paper and lifted cards", () => {
    assert.ok(contrastRatio(SPARES_TONES.muted, SPARES_TONES.paper) >= AA_NORMAL);
    assert.ok(contrastRatio(SPARES_TONES.muted, SPARES_TONES.lift) >= AA_NORMAL);
    assert.ok(contrastRatio(SPARES_TONES.muted, SPARES_TONES.soft) >= AA_NORMAL);
  });

  it("uses light text on accent and danger fills", () => {
    assert.ok(contrastRatio(SPARES_TONES.onAccent, SPARES_TONES.accent) >= AA_LARGE);
    assert.ok(contrastRatio(SPARES_TONES.onDanger, SPARES_TONES.danger) >= AA_NORMAL);
  });

  it("keeps dark-glass viewer chrome readable on the stage", () => {
    assert.ok(contrastRatio(SPARES_TONES.onChip, SPARES_TONES.chip) >= AA_NORMAL);
    assert.ok(contrastRatio(SPARES_TONES.onChip, SPARES_TONES.stage) >= AA_NORMAL);
  });

  it("keeps login type readable on the dark entry surface", () => {
    assert.ok(contrastRatio(SPARES_TONES.onLogin, SPARES_TONES.login) >= AA_NORMAL);
  });

  it("keeps light chrome marks readable on the stage and lifted shade", () => {
    assert.ok(contrastRatio(SPARES_TONES.onChrome, SPARES_TONES.stage) >= AA_NORMAL);
    assert.ok(contrastRatio(SPARES_TONES.onChrome, SPARES_TONES.chrome) >= AA_LARGE);
  });
});
