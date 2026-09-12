import Link from "next/link";
import { TicketStatusChip } from "@/components/care/TicketStatusChip";
import { EmptyState } from "@/components/states/EmptyState";
import { formatDay } from "@/components/quote/quote-format";
import { ticketHref } from "@/lib/care";
import type { ServiceTicket } from "@/types";

export function TicketsList({
  tickets,
  emptyTitle,
  emptyMessage,
  showMachine = false,
  selectedId,
  hrefFor,
}: {
  tickets: ServiceTicket[];
  emptyTitle: string;
  emptyMessage: string;
  showMachine?: boolean;
  selectedId?: string;
  hrefFor?: (ticket: ServiceTicket) => string;
}) {
  if (tickets.length === 0) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />;
  }

  return (
    <ul className="spares-surface divide-y divide-white/8 overflow-hidden rounded-[24px]">
      {tickets.map((ticket) => (
        <li key={ticket.id}>
          <Link
            href={hrefFor ? hrefFor(ticket) : ticketHref(ticket.machineId, ticket.id)}
            aria-current={selectedId === ticket.id ? "true" : undefined}
            className={
              selectedId === ticket.id ? "care-row is-selected" : "care-row"
            }
          >
            {ticket.unread ? (
              <span
                className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-[#0a84ff] sm:mt-0.5"
                aria-label="Unread"
              />
            ) : (
              <span className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <p className="care-row-title">
                Ticket {ticket.number}
                <span className="spares-muted font-normal">
                  {" "}
                  · {ticket.title}
                </span>
              </p>
              <p className="spares-muted mt-0.5 truncate text-sm">
                {formatDay(ticket.createdAt)}
                {showMachine && ticket.machineName
                  ? ` · ${ticket.machineName}`
                  : ""}
              </p>
            </div>
            <TicketStatusChip status={ticket.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
