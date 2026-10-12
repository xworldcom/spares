import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseEditableQty,
  qtyDraftIsComplete,
  qtyKeyReplacesDraft,
  sanitizeQtyDraft,
  validateEditableQty,
} from "./editable-qty.ts";

describe("editable qty", () => {
  it("rejects negative quantities with an error", () => {
    const result = validateEditableQty("-3");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /negative/i);
    }
  });
  it("keeps a typed integer ≥ 1", () => {
    assert.equal(parseEditableQty("10"), 10);
    assert.equal(parseEditableQty(" 25 "), 25);
  });

  it("treats empty and invalid drafts as 1 on commit so the field can be cleared", () => {
    assert.equal(parseEditableQty(""), 1);
    assert.equal(parseEditableQty("   "), 1);
    assert.equal(parseEditableQty("1.5"), 1);
    assert.equal(parseEditableQty("0"), 1);
    assert.equal(parseEditableQty("-3"), 1);
  });

  it("surfaces validation errors without silent abs()", () => {
    assert.deepEqual(validateEditableQty("-3"), {
      ok: false,
      error: "Quantity cannot be negative.",
    });
    assert.deepEqual(validateEditableQty("2.5"), {
      ok: false,
      error: "Whole numbers only.",
    });
  });

  it("does not treat an empty in-progress draft as complete", () => {
    assert.equal(qtyDraftIsComplete(""), false);
    assert.equal(qtyDraftIsComplete("10"), true);
    assert.equal(qtyDraftIsComplete("0"), false);
  });

  it("strips non-digits so replace/clear/type works on a numeric keypad", () => {
    assert.equal(sanitizeQtyDraft("1"), "1");
    assert.equal(sanitizeQtyDraft(""), "");
    assert.equal(sanitizeQtyDraft("12a"), "12");
    assert.equal(sanitizeQtyDraft(" 8 "), "8");
    assert.equal(sanitizeQtyDraft("-3"), "-3");
    assert.equal(sanitizeQtyDraft("-"), "-");
  });

  it("keeps a decimal point so 1.5 is rejected instead of becoming 15", () => {
    assert.equal(sanitizeQtyDraft("1.5"), "1.5");
    assert.deepEqual(validateEditableQty("1.5"), {
      ok: false,
      error: "Whole numbers only.",
    });
  });

  it("rejects quantities above the max", () => {
    assert.deepEqual(validateEditableQty("100000"), {
      ok: false,
      error: "Quantity is too large.",
    });
  });

  it("replaces the focused qty on the first typed digit", () => {
    assert.equal(qtyKeyReplacesDraft(true, "2"), true);
    assert.equal(qtyKeyReplacesDraft(true, "25"), false);
    assert.equal(qtyKeyReplacesDraft(false, "2"), false);
    assert.equal(qtyKeyReplacesDraft(true, "Backspace"), false);
  });
});
