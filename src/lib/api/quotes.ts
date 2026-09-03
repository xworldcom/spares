import { apiFetch } from "./client";
import type { CreateQuoteResponse, Quote, QuotesListResponse } from "./types";

export async function createQuote(input: {
  machineId: string;
  partIds: string[];
  note?: string;
}): Promise<Quote> {
  const data = await apiFetch<CreateQuoteResponse>("/api/quotes", {
    method: "POST",
    body: JSON.stringify({
      machineId: input.machineId,
      partIds: input.partIds,
      ...(input.note ? { note: input.note } : {}),
    }),
  });
  return data.quote;
}

export async function listQuotes(): Promise<Quote[]> {
  const data = await apiFetch<QuotesListResponse>("/api/quotes");
  return data.quotes ?? [];
}
