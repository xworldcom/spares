import { requireRole } from "@/lib/auth";
import { toPublicTicket } from "@/lib/care";
import { json } from "@/lib/http";
import { listMachines, listTickets } from "@/lib/store";

export async function GET() {
  const auth = await requireRole("staff");
  if ("error" in auth) {
    return auth.error;
  }

  const [tickets, machines] = await Promise.all([listTickets(), listMachines()]);
  const names = new Map(machines.map((machine) => [machine.id, machine.name]));
  return json({
    tickets: tickets.map((ticket) =>
      toPublicTicket(ticket, auth.user, names.get(ticket.machineId)),
    ),
  });
}
