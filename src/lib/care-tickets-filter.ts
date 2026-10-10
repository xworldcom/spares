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

export function ticketMatchesCareSearch(ticket: ServiceTicket, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
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
  return hay.includes(needle);
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
  sorted.sort((a, b) => {
    const left =
      options.sort === "updated"
        ? (a.activities.at(-1)?.at ?? a.createdAt)
        : a.createdAt;
    const right =
      options.sort === "updated"
        ? (b.activities.at(-1)?.at ?? b.createdAt)
        : b.createdAt;
    return new Date(right).getTime() - new Date(left).getTime();
  });
  return sorted;
}
