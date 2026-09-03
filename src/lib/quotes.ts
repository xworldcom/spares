import type { Quote, QuoteItem } from "@/types";

export type ParseQuoteItemsResult =
  | { ok: true; items: QuoteItem[] }
  | { ok: false; error: string };

function asQty(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed >= 1) {
      return parsed;
    }
  }
  return null;
}

export function parseQuoteItems(raw: unknown): ParseQuoteItemsResult {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "items must be a non-empty array" };
  }

  const items: QuoteItem[] = [];
  const seen = new Set<string>();

  for (const row of raw) {
    if (!row || typeof row !== "object") {
      return { ok: false, error: "each item must be { id, qty }" };
    }
    const record = row as { id?: unknown; qty?: unknown };
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const qty = asQty(record.qty);
    if (!id) {
      return { ok: false, error: "each item needs a part id" };
    }
    if (qty === null) {
      return { ok: false, error: "qty must be an integer ≥ 1" };
    }
    if (seen.has(id)) {
      return { ok: false, error: "duplicate part id in items" };
    }
    seen.add(id);
    items.push({ id, qty });
  }

  return { ok: true, items };
}

export function normalizeStoredQuote(raw: Quote): Quote {
  if (Array.isArray(raw.items) && raw.items.length > 0) {
    return {
      ...raw,
      items: raw.items.map((item) => ({
        id: item.id,
        qty: typeof item.qty === "number" && item.qty >= 1 ? Math.floor(item.qty) : 1,
      })),
    };
  }

  const legacyIds = (raw as Quote & { partIds?: unknown }).partIds;
  if (Array.isArray(legacyIds)) {
    return {
      ...raw,
      items: legacyIds
        .filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
        .map((id) => ({ id: id.trim(), qty: 1 })),
    };
  }

  return { ...raw, items: [] };
}
