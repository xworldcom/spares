type AppRouter = {
  prefetch: (href: string) => void;
};
import {
  getCareOverview,
  getTicket,
  listAccessibleTickets,
} from "@/lib/api/care";
import { listMachines } from "@/lib/api/machines";
import { getQuote, listQuotes } from "@/lib/api/quotes";
import { warmRead } from "@/lib/api/warm-read";

export function prefetchAppRoute(router: AppRouter, href: string) {
  if (!href.startsWith("/")) {
    return;
  }
  try {
    void router.prefetch(href);
  } catch {
    // Prefetch is best-effort.
  }
}

export function warmTicketDetail(ticketId: string) {
  warmRead(`ticket:${ticketId}`, () => getTicket(ticketId));
}

export function warmQuoteDetail(quote: { id: string; number: number }) {
  const byNumber = String(quote.number);
  warmRead(`quote:${byNumber}`, () => getQuote(byNumber));
  warmRead(`quote:${quote.id}`, () => getQuote(byNumber));
}

export function warmCareOverview(machineId: string) {
  warmRead(`care-overview:${machineId}`, () => getCareOverview(machineId));
}

export function warmCareHubLists() {
  warmRead("care-hub:machines", () => listMachines());
  warmRead("tickets:accessible", () => listAccessibleTickets());
}

export function warmQuotesList() {
  warmRead("quotes:list", () => listQuotes());
}

export function warmMachineCareTabs(machineId: string) {
  prefetchCareTabRoutes(machineId);
  warmCareOverview(machineId);
}

export function prefetchCareTabRoutes(machineId: string) {
  return [
    `/machines/${machineId}`,
    `/machines/${machineId}/quotes`,
    `/machines/${machineId}/care`,
    `/machines/${machineId}/care/manuals`,
    `/machines/${machineId}/care/tickets`,
    `/machines/${machineId}/care/service`,
  ];
}
