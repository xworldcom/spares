"use client";

import {
  QUOTE_PIPELINE,
  QUOTE_STATUS_LABELS,
} from "@/lib/quotes";
import type { QuoteStatus } from "@/types";

export function QuoteStatusStrip({
  status,
  editable,
  pending,
  onChange,
}: {
  status: QuoteStatus;
  editable: boolean;
  pending?: boolean;
  onChange?: (status: QuoteStatus) => void;
}) {
  const currentIndex =
    status === "cancelled"
      ? -1
      : QUOTE_PIPELINE.indexOf(status as (typeof QUOTE_PIPELINE)[number]);

  return (
    <div className="space-y-3">
      <p className="text-[15px] font-semibold tracking-tight sm:hidden">
        {QUOTE_STATUS_LABELS[status]}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {QUOTE_PIPELINE.map((step, index) => {
          const current = status === step;
          const past = status !== "cancelled" && index < currentIndex;
          const className = current
            ? "btn-primary rounded-full px-3 text-[13px] font-semibold sm:px-3.5 sm:text-sm"
            : past
              ? "btn-soft rounded-full px-3 text-[13px] font-medium sm:px-3.5 sm:text-sm"
              : "rounded-full bg-white px-3 text-[13px] font-medium text-neutral-500 sm:px-3.5 sm:text-sm";
          if (editable && onChange) {
            return (
              <button
                key={step}
                type="button"
                disabled={pending || current}
                onClick={() => onChange(step)}
                className={`inline-flex h-11 min-w-0 items-center justify-center ${className} disabled:opacity-100`}
              >
                {QUOTE_STATUS_LABELS[step]}
              </button>
            );
          }
          return (
            <span
              key={step}
              className={`inline-flex h-11 min-w-0 items-center justify-center ${className}`}
            >
              {QUOTE_STATUS_LABELS[step]}
            </span>
          );
        })}
      </div>
      {editable && onChange ? (
        <button
          type="button"
          disabled={pending || status === "cancelled"}
          onClick={() => onChange("cancelled")}
          className={
            status === "cancelled"
              ? "btn-danger inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold"
              : "inline-flex h-11 items-center rounded-full px-4 text-sm font-medium text-[#7f1d1d]"
          }
        >
          {status === "cancelled" ? "Cancelled" : "Cancel quote"}
        </button>
      ) : status === "cancelled" ? (
        <p className="text-sm font-medium text-[#7f1d1d]">Cancelled</p>
      ) : null}
    </div>
  );
}
