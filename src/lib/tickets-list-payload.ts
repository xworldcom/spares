import { canAccessMachine } from "@/lib/access";
import { staffAssistantEnabled } from "@/lib/assistant/public";
import { ticketIsOpen, toPublicTicketListRow } from "@/lib/care";
import { ticketHiddenFromCustomer } from "@/lib/demo-customer-visibility.ts";
import type { TicketsListResponse } from "@/lib/api/types";
import { readTenantWorkListSnapshot } from "@/lib/store";
import type { PublicUser } from "@/types";

export async function buildAccessibleTicketsListPayload(
  user: PublicUser,
  tenantId: string,
): Promise<TicketsListResponse> {
  const snapshot = await readTenantWorkListSnapshot(tenantId);
  const visible = new Map(
    snapshot.machines
      .filter((machine) =>
        canAccessMachine(user, machine, snapshot.sites, snapshot.customers),
      )
      .map((machine) => [machine.id, machine.name]),
  );

  const assistantAvailable =
    user.role === "staff" ? await staffAssistantEnabled() : false;

  const filtered = snapshot.tickets
    .filter((ticket) => visible.has(ticket.machineId))
    .filter(
      (ticket) =>
        user.role === "staff" || !ticketHiddenFromCustomer(ticket, tenantId),
    )
    .map((ticket) =>
      toPublicTicketListRow(ticket, user, visible.get(ticket.machineId), {
        assistantAvailable: user.role === "staff" ? assistantAvailable : undefined,
      }),
    );

  return {
    tickets: filtered,
    unreadCount: filtered.filter(
      (ticket) => ticket.unread && ticketIsOpen(ticket.status),
    ).length,
  };
}
