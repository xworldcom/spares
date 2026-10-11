type AppRouter = {
  prefetch: (href: string) => void;
};
import {
  getCareOverview,
  listAccessibleTickets,
  warmTicketDetailFetch,
} from "@/lib/api/care";
import { listMachines, warmMachineName } from "@/lib/api/machines";
import { listQuotes, warmQuoteDetailFetch } from "@/lib/api/quotes";
import { prefetchStaffHostDirectory } from "@/lib/api/staff-directory";
import { prefetchStaffPartLifecycleDefault } from "@/lib/api/part-lifecycle";
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
  warmRead(`ticket:${ticketId}:warm`, () => warmTicketDetailFetch(ticketId));
}

export function warmQuoteDetail(quote: { id: string; number: number }) {
  const byNumber = String(quote.number);
  const load = () => warmQuoteDetailFetch(byNumber);
  warmRead(`quote:${byNumber}:prefetch`, load);
  warmRead(`quote:${quote.id}:prefetch`, load);
}

export function warmCareOverview(machineId: string) {
  warmRead(`care-overview:${machineId}`, () => getCareOverview(machineId));
}

export function warmCareHubLists() {
  warmRead("care-hub:machines", () => listMachines());
  warmRead("tickets:accessible", () => listAccessibleTickets());
}

export function warmQuotesList() {
  warmRead("quotes:list", () => listQuotes({ background: true }));
}

export function warmTicketsList() {
  warmRead("tickets:accessible", () => listAccessibleTickets());
}

export function warmStaffHubLists() {
  prefetchStaffHostDirectory();
  prefetchStaffPartLifecycleDefault();
}

export function warmMachineCareTabs(machineId: string) {
  prefetchCareTabRoutes(machineId);
  warmCareOverview(machineId);
  warmMachineName(machineId);
}

export function warmMachineRoute(machineId: string) {
  warmMachineName(machineId);
  warmMachineCareTabs(machineId);
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
