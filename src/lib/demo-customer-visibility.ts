import { DEFAULT_TENANT_ID } from "./tenant.ts";

const CAS_GATE_TITLE = /^(CAS s[123] |cas gate test)/i;

/** Gate/smoke ticket numbers hidden from demo customers (not #9–16 story tickets). */
export function isDemoCustomerHiddenTicketNumber(number: number): boolean {
  if (number >= 1 && number <= 8) {
    return true;
  }
  if (number >= 17 && number <= 34) {
    return true;
  }
  return false;
}

export function isDemoGateTicketTitle(title: string | undefined) {
  return CAS_GATE_TITLE.test((title ?? "").trim());
}

/** Demo host: gate/smoke tickets hidden from customer Care (catalog rules; ignore stale v2 flags). */
export function ticketHiddenFromCustomer(
  ticket: {
    hiddenFromCustomer?: boolean;
    number?: number;
    title?: string;
    tenantId?: string;
  },
  tenantId: string,
): boolean {
  const rowTenant = ticket.tenantId ?? tenantId;
  if (rowTenant !== DEFAULT_TENANT_ID) {
    return false;
  }
  if (typeof ticket.number === "number" && isDemoCustomerHiddenTicketNumber(ticket.number)) {
    return true;
  }
  if (isDemoGateTicketTitle(ticket.title)) {
    return true;
  }
  return false;
}
