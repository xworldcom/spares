import { canAccessMachine } from "@/lib/access";
import { staffAssistantEnabled } from "@/lib/assistant/public";
import { requireTenantUser } from "@/lib/auth/tenant-scope";
import { toPublicTicketListRow } from "@/lib/care";
import { respondDerivedList } from "@/lib/derived-list-cache";
import { listScopeKey } from "@/lib/list-scope";
import type { NextRequest } from "next/server";
import { readTenantWorkListSnapshot } from "@/lib/store";

export async function GET(request: NextRequest) {
  const auth = await requireTenantUser();
  if ("error" in auth) {
    return auth.error;
  }

  const scope = listScopeKey("tickets", auth.tenantId, auth.user);
  return respondDerivedList(request, scope, async () => {
    const snapshot = await readTenantWorkListSnapshot(auth.tenantId);
    const visible = new Map(
      snapshot.machines
        .filter((machine) =>
          canAccessMachine(auth.user, machine, snapshot.sites, snapshot.customers),
        )
        .map((machine) => [machine.id, machine.name]),
    );

    const assistantAvailable =
      auth.user.role === "staff" ? await staffAssistantEnabled() : false;

    const filtered = snapshot.tickets
      .filter((ticket) => visible.has(ticket.machineId))
      .map((ticket) =>
        toPublicTicketListRow(ticket, auth.user, visible.get(ticket.machineId), {
          assistantAvailable: auth.user.role === "staff" ? assistantAvailable : undefined,
        }),
      );

    return {
      tickets: filtered,
      unreadCount: filtered.filter((ticket) => ticket.unread).length,
    };
  });
}
