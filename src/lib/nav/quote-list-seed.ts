import type { Quote } from "@/types";

let recentQuotes: Quote[] = [];

export function rememberQuotesForNav(quotes: Quote[]) {
  recentQuotes = quotes;
}

export function rememberQuoteForNav(quote: Quote) {
  recentQuotes = [
    quote,
    ...recentQuotes.filter(
      (row) => row.id !== quote.id && String(row.number) !== String(quote.number),
    ),
  ];
}

export function quoteSeedForRef(ref: string): Quote | undefined {
  return recentQuotes.find(
    (quote) => quote.id === ref || String(quote.number) === ref,
  );
}
