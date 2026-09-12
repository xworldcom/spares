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
          ? "btn-danger inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold"
          : current
            ? "btn-primary inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold"
            : "btn-soft inline-flex h-8 items-center rounded-full px-3 text-xs font-medium"
      }
    >
      {QUOTE_STATUS_LABELS[status]}
    </span>
  );
}
