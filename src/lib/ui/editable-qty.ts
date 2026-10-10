/** Parse a qty field draft. Empty or invalid drafts become 1 (MOQ floor). */
export function parseEditableQty(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) {
    return 1;
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    return 1;
  }
  if (parsed < 1) {
    const abs = Math.abs(parsed);
    return abs >= 1 ? Math.min(abs, 999_999_999) : 1;
  }
  return Math.min(parsed, 999_999_999);
}

/** True when the draft is a complete integer ≥ 1 (safe to write through). */
export function qtyDraftIsComplete(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) {
    return false;
  }
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 1;
}

/** Keep digits only so iPhone can clear and retype without a stuck leading 1. */
export function sanitizeQtyDraft(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

/** First digit after focus replaces the current qty (Fern: typing replaces). */
export function qtyKeyReplacesDraft(replaceOnType: boolean, key: string) {
  return replaceOnType && /^\d$/.test(key);
}
