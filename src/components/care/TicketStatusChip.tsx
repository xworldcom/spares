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
          ? "status-pill status-pill--muted"
          : current
            ? "status-pill status-pill--current"
            : "status-pill status-pill--accent"
      }
    >
      {TICKET_STATUS_LABELS[status]}
    </span>
  );
}
