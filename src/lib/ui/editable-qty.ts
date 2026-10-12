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
  if (trimmed.startsWith("-") || /-\d/.test(trimmed)) {
    return { ok: false, error: "Quantity cannot be negative." };
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return { ok: false, error: "Whole numbers only." };
  }
  if (parsed < 1) {
    return { ok: false, error: "Quantity must be at least 1." };
  }
  if (parsed > 99_999) {
    return { ok: false, error: "Quantity is too large." };
  }
  return { ok: true, qty: parsed };
}

/** True when the draft is a complete integer ≥ 1 (safe to write through). */
export function qtyDraftIsComplete(raw: string): boolean {
  return validateEditableQty(raw).ok;
}

/** Keep digits and one decimal separator so validation can reject decimals (not strip to 15). */
export function sanitizeQtyDraft(raw: string): string {
  const trimmed = raw.trim();
  const negative = trimmed.startsWith("-");
  let body = trimmed.slice(negative ? 1 : 0).replace(/[^\d.]/g, "");
  const dot = body.indexOf(".");
  if (dot >= 0) {
    body = `${body.slice(0, dot + 1)}${body.slice(dot + 1).replace(/\./g, "")}`;
  }
  if (negative) {
    if (!body) {
      return "-";
    }
    return `-${body}`;
  }
  return body;
}

/** First digit after focus replaces the current qty (Fern: typing replaces). */
export function qtyKeyReplacesDraft(replaceOnType: boolean, key: string) {
  return replaceOnType && /^\d$/.test(key);
}
