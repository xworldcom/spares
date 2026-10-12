import { DEFAULT_TENANT_ID } from "./tenant.ts";

const CAS_GATE_TITLE = /^(CAS s[123] |cas gate test)/i;

export function isDemoGateTicketTitle(title: string | undefined) {
  return CAS_GATE_TITLE.test((title ?? "").trim());
}

/** Demo host: gate/smoke tickets hidden from customer Care (persisted flag or catalog rules). */
export function ticketHiddenFromCustomer(
  ticket: {
    hiddenFromCustomer?: boolean;
    number?: number;
    title?: string;
    tenantId?: string;
  },
  tenantId: string,
): boolean {
  if (ticket.hiddenFromCustomer) {
    return true;
  }
  const rowTenant = ticket.tenantId ?? tenantId;
  if (rowTenant !== DEFAULT_TENANT_ID) {
    return false;
  }
  if (typeof ticket.number === "number" && ticket.number >= 1 && ticket.number <= 26) {
    return true;
  }
  return isDemoGateTicketTitle(ticket.title);
}
