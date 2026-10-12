import { ticketIsOpen } from "@/lib/care";
import type { ServiceTicket } from "@/types";

export const CARE_TICKETS_Q_QUERY = "q";
export const CARE_TICKETS_STATUS_QUERY = "status";
export const CARE_TICKETS_SORT_QUERY = "sort";

export type CareTicketsStatusFilter = "all" | "open" | "closed";
export type CareTicketsSort = "recent" | "updated";

export function careTicketsStatusFromParam(
  value: string | null | undefined,
): CareTicketsStatusFilter {
  if (value === "open" || value === "closed") {
    return value;
  }
  return "all";
}

export function careTicketsSortFromParam(
  value: string | null | undefined,
): CareTicketsSort {
  return value === "updated" ? "updated" : "recent";
}

function careSearchNeedles(query: string): string[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return [];
  }
  const needles = new Set<string>([trimmed]);
  const ticketRef = trimmed.match(/^t(?:icket)?\s*#?(\d+)$/i);
  if (ticketRef?.[1]) {
    needles.add(ticketRef[1]);
    needles.add(`#${ticketRef[1]}`);
  }
  const hashNum = trimmed.match(/^#(\d+)$/);
  if (hashNum?.[1]) {
    needles.add(hashNum[1]);
  }
  return [...needles];
}

export function ticketMatchesCareSearch(ticket: ServiceTicket, query: string): boolean {
  const needles = careSearchNeedles(query);
  if (needles.length === 0) {
    return true;
  }
  const hay = [
    ticket.number,
    ticket.title,
    ticket.machineName,
    ticket.machineId,
    ticket.id,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const numberText = String(ticket.number).toLowerCase();
  return needles.some(
    (needle) =>
      hay.includes(needle) ||
      needle === numberText ||
      needle === `#${numberText}` ||
      needle.replace(/^#/, "") === numberText,
  );
}

export function filterAndSortCareTickets(
  tickets: ServiceTicket[],
  options: {
    query: string;
    status: CareTicketsStatusFilter;
    sort: CareTicketsSort;
  },
): ServiceTicket[] {
  let rows = tickets;
  if (options.status === "open") {
    rows = rows.filter((ticket) => ticketIsOpen(ticket.status));
  } else if (options.status === "closed") {
    rows = rows.filter((ticket) => !ticketIsOpen(ticket.status));
  }
  const q = options.query.trim();
  if (q) {
    rows = rows.filter((ticket) => ticketMatchesCareSearch(ticket, q));
  }
  const sorted = [...rows];
  function sortTimestamp(ticket: ServiceTicket) {
    if (options.sort === "updated") {
      return (
        ticket.lastModifiedAt ??
        ticket.activities.at(-1)?.at ??
        ticket.createdAt
      );
    }
    return ticket.createdAt;
  }
  sorted.sort((a, b) => {
    const left = sortTimestamp(a);
    const right = sortTimestamp(b);
    return new Date(right).getTime() - new Date(left).getTime();
  });
  return sorted;
}
