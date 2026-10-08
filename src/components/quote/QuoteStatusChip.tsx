import { QUOTE_STATUS_LABELS } from "@/lib/quotes";
import type { QuoteStatus } from "@/types";

export function QuoteStatusChip({
  status,
  current = false,
}: {
  status: QuoteStatus;
  current?: boolean;
}) {
  const cancelled = status === "cancelled";
  return (
    <span
      className={
        cancelled
          ? "status-pill status-pill--danger"
          : current
            ? "status-pill status-pill--current"
            : "status-pill status-pill--muted"
      }
    >
      {QUOTE_STATUS_LABELS[status]}
    </span>
  );
}
