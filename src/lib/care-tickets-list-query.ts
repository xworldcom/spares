import {
  CARE_TICKETS_Q_QUERY,
  CARE_TICKETS_SORT_QUERY,
  CARE_TICKETS_STATUS_QUERY,
} from "@/lib/care-tickets-filter";
import { WORK_LIST_MACHINE_QUERY } from "@/lib/work-list-scope";

const CARE_TICKETS_LIST_QUERY_KEYS = [
  CARE_TICKETS_Q_QUERY,
  CARE_TICKETS_STATUS_QUERY,
  CARE_TICKETS_SORT_QUERY,
  WORK_LIST_MACHINE_QUERY,
] as const;

/** Serialized list filters for ticket detail URLs and back navigation. */
export function careTicketsListQueryString(searchParams: URLSearchParams): string {
  const next = new URLSearchParams();
  for (const key of CARE_TICKETS_LIST_QUERY_KEYS) {
    const value = searchParams.get(key)?.trim();
    if (value) {
      next.set(key, value);
    }
  }
  const qs = next.toString();
  return qs ? `?${qs}` : "";
}

export function hrefWithCareTicketsListQuery(
  href: string,
  searchParams: URLSearchParams,
): string {
  const qs = careTicketsListQueryString(searchParams);
  if (!qs) {
    return href;
  }
  return `${href}${qs}`;
}
