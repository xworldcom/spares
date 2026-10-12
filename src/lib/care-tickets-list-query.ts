import {
  CARE_TICKETS_Q_QUERY,
  CARE_TICKETS_SORT_QUERY,
  CARE_TICKETS_STATUS_QUERY,
} from "@/lib/care-tickets-filter";
import { WORK_LIST_MACHINE_QUERY } from "@/lib/work-list-scope";

export type CareTicketsRouteScope = "hub" | "machine";

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

/** Merge list-filter query keys onto an existing href (e.g. hub scope machine picker). */
export function mergeHrefWithCareTicketsListQuery(
  href: string,
  searchParams: URLSearchParams,
): string {
  const extra = careTicketsListQueryString(searchParams);
  if (!extra) {
    return href;
  }
  const qIndex = href.indexOf("?");
  if (qIndex === -1) {
    return `${href}${extra}`;
  }
  const path = href.slice(0, qIndex);
  const merged = new URLSearchParams(href.slice(qIndex + 1));
  const add = new URLSearchParams(extra.slice(1));
  for (const key of add.keys()) {
    const value = add.get(key);
    if (value) {
      merged.set(key, value);
    }
  }
  const out = merged.toString();
  return out ? `${path}?${out}` : path;
}

/** List or open-ticket path with the same serialized list filters in the query string. */
export function careTicketsPathWithListQuery(
  scope: CareTicketsRouteScope,
  options: {
    listHref: string;
    searchParams: URLSearchParams;
    machineId?: string;
    ticketId?: string;
  },
): string {
  const { listHref, searchParams, machineId, ticketId } = options;
  const qs = careTicketsListQueryString(searchParams);
  if (ticketId) {
    const base =
      scope === "hub"
        ? `/care/tickets/${ticketId}`
        : `/machines/${machineId ?? ""}/care/tickets/${ticketId}`;
    return `${base}${qs}`;
  }
  return `${listHref}${qs}`;
}
