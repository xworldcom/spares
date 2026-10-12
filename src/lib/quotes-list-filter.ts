import type { QuoteStatus } from "@/lib/api/types";
import { WORK_LIST_MACHINE_QUERY } from "@/lib/work-list-scope";

export const QUOTES_STATUS_QUERY = "status";
export const QUOTES_Q_QUERY = "q";

export type QuotesStatusFilter = QuoteStatus | "all" | "in_review" | "closed_group";

const STAFF_STATUS_VALUES = new Set<QuotesStatusFilter>([
  "all",
  "in_review",
  "closed_group",
]);

const CUSTOMER_STATUS_VALUES = new Set<QuotesStatusFilter>([
  "all",
  "requested",
  "pricing",
  "quoted",
  "ordered",
  "shipped",
  "delivered",
  "cancelled",
]);

export function quotesStatusFromParam(
  value: string | null | undefined,
  role: "customer" | "staff",
): QuotesStatusFilter {
  if (!value) {
    return "all";
  }
  if (role === "staff") {
    return STAFF_STATUS_VALUES.has(value as QuotesStatusFilter)
      ? (value as QuotesStatusFilter)
      : "all";
  }
  return CUSTOMER_STATUS_VALUES.has(value as QuotesStatusFilter)
    ? (value as QuotesStatusFilter)
    : "all";
}

const QUOTES_LIST_QUERY_KEYS = [
  QUOTES_STATUS_QUERY,
  QUOTES_Q_QUERY,
  WORK_LIST_MACHINE_QUERY,
] as const;

export function quotesListQueryString(searchParams: URLSearchParams): string {
  const next = new URLSearchParams();
  for (const key of QUOTES_LIST_QUERY_KEYS) {
    const value = searchParams.get(key)?.trim();
    if (value) {
      next.set(key, value);
    }
  }
  const qs = next.toString();
  return qs ? `?${qs}` : "";
}

export function hrefWithQuotesListQuery(
  href: string,
  searchParams: URLSearchParams,
): string {
  const qs = quotesListQueryString(searchParams);
  if (!qs) {
    return href;
  }
  return `${href}${qs}`;
}
