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

function careTicketNumberText(ticket: ServiceTicket): string {
  return String(ticket.number).trim();
}

/** Lower rank = better match when sorting search results. */
export function careTicketSearchRank(ticket: ServiceTicket, query: string): number {
  const trimmed = query.trim();
  if (!trimmed) {
    return 0;
  }
  const lower = trimmed.toLowerCase();
  const numberText = careTicketNumberText(ticket).toLowerCase();
  const ticketRef = lower.match(/^t(?:icket)?\s*#?(\d+)$/i);
  const refNum = ticketRef?.[1];
  const hashNum = lower.match(/^#?(\d+)$/);
  const bareNum = hashNum?.[1] ?? (/^\d+$/.test(lower) ? lower : null);
  const targetNum = refNum ?? bareNum;
  if (targetNum && numberText === targetNum) {
    return 0;
  }
  if (targetNum && numberText.includes(targetNum)) {
    return 1;
  }
  if (ticketMatchesCareSearch(ticket, query)) {
    return 2;
  }
  return 99;
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
  const trimmed = query.trim();
  if (/^\d+$/.test(trimmed)) {
    return careTicketNumberText(ticket) === trimmed;
  }
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
    if (q) {
      const rankA = careTicketSearchRank(a, q);
      const rankB = careTicketSearchRank(b, q);
      if (rankA !== rankB) {
        return rankA - rankB;
      }
    }
    const left = sortTimestamp(a);
    const right = sortTimestamp(b);
    return new Date(right).getTime() - new Date(left).getTime();
  });
  return sorted;
}
