/** Parse a qty field draft. Empty or invalid drafts become 1 (MOQ floor) when committing blur. */
export function parseEditableQty(raw: string): number {
  const validated = validateEditableQty(raw);
  if (validated.ok) {
    return validated.qty;
  }
  return 1;
}

export function validateEditableQty(
  raw: string,
): { ok: true; qty: number } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter a quantity." };
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    return { ok: false, error: "Whole numbers only." };
  }
  if (parsed < 1) {
    return { ok: false, error: "Quantity must be at least 1." };
  }
  return { ok: true, qty: Math.min(parsed, 999_999_999) };
}

/** True when the draft is a complete integer ≥ 1 (safe to write through). */
export function qtyDraftIsComplete(raw: string): boolean {
  return validateEditableQty(raw).ok;
}

/** Keep digits only so iPhone can clear and retype without a stuck leading 1. */
export function sanitizeQtyDraft(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

/** First digit after focus replaces the current qty (Fern: typing replaces). */
export function qtyKeyReplacesDraft(replaceOnType: boolean, key: string) {
  return replaceOnType && /^\d$/.test(key);
}
