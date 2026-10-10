import { staffAssistantEnabled } from "@/lib/assistant/public";
import { requireTenantStaff } from "@/lib/auth/tenant-scope";
import { toPublicTicketListRow } from "@/lib/care";
import { respondDerivedList } from "@/lib/derived-list-cache";
import { listScopeKey } from "@/lib/list-scope";
import type { NextRequest } from "next/server";
import { readTenantWorkListSnapshot } from "@/lib/store";

export async function GET(request: NextRequest) {
  const auth = await requireTenantStaff();
  if ("error" in auth) {
    return auth.error;
  }

  const scope = listScopeKey("staff-tickets", auth.tenantId, auth.user);
  return respondDerivedList(request, scope, async () => {
    const snapshot = await readTenantWorkListSnapshot(auth.tenantId);
    const names = new Map(snapshot.machines.map((machine) => [machine.id, machine.name]));
    const assistantAvailable = await staffAssistantEnabled();
    const publicTickets = snapshot.tickets.map((ticket) =>
      toPublicTicketListRow(ticket, auth.user, names.get(ticket.machineId), {
        assistantAvailable,
      }),
    );
    return {
      tickets: publicTickets,
      unreadCount: publicTickets.filter((ticket) => ticket.unread).length,
    };
  });
}
