import { apiFetch } from "./client";
import type { CreateQuoteResponse, Quote, QuoteItem, QuotesListResponse } from "./types";

export async function createQuote(input: {
  machineId: string;
  items: QuoteItem[];
  note?: string;
}): Promise<Quote> {
  const data = await apiFetch<CreateQuoteResponse>("/api/quotes", {
    method: "POST",
    body: JSON.stringify({
      machineId: input.machineId,
      items: input.items,
      ...(input.note ? { note: input.note } : {}),
    }),
  });
  return data.quote;
}

export async function listQuotes(): Promise<Quote[]> {
  const data = await apiFetch<QuotesListResponse>("/api/quotes");
  return data.quotes ?? [];
}
