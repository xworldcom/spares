import { TICKET_STATUS_LABELS } from "@/lib/care";
import type { TicketStatus } from "@/types";

export function TicketStatusChip({
  status,
  current = false,
}: {
  status: TicketStatus;
  current?: boolean;
}) {
  const closed = status === "closed" || status === "resolved";
  return (
    <span
      className={
        closed
          ? "btn-soft inline-flex h-8 items-center rounded-full px-3 text-xs font-medium"
          : current
            ? "btn-primary inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold"
            : "btn-accent inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold"
      }
    >
      {TICKET_STATUS_LABELS[status]}
    </span>
  );
}
