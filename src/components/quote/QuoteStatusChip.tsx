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
          ? "inline-flex h-8 items-center rounded-full bg-[#7f1d1d] px-3 text-xs font-semibold text-white"
          : current
            ? "inline-flex h-8 items-center rounded-full bg-[#0b0d10] px-3 text-xs font-semibold text-white"
            : "inline-flex h-8 items-center rounded-full bg-[#eceef2] px-3 text-xs font-medium text-neutral-700"
      }
    >
      {QUOTE_STATUS_LABELS[status]}
    </span>
  );
}
