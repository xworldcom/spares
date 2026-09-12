"use client";

import { useEffect, useRef } from "react";
import {
  QUOTE_PIPELINE,
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_SHORT,
  quoteStatusCaption,
  quoteStepState,
} from "@/lib/quotes";
import type { QuoteStatus, Role } from "@/types";

export function QuoteStatusStrip({
  status,
  editable,
  pending,
  role = "customer",
  onChange,
}: {
  status: QuoteStatus;
  editable: boolean;
  pending?: boolean;
  role?: Role;
  onChange?: (status: QuoteStatus) => void;
}) {
  const cancelled = status === "cancelled";
  const trackRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const current = trackRef.current?.querySelector<HTMLElement>(
      '[data-state="current"]',
    );
    current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [status]);

  return (
    <div className="quote-progress" data-cancelled={cancelled || undefined}>
      <ol
        ref={trackRef}
        className="quote-progress-track"
        aria-label="Quote progress"
      >
        {QUOTE_PIPELINE.map((step) => {
          const state = quoteStepState(status, step);
          const label = QUOTE_STATUS_LABELS[step];
          const className = `quote-progress-step quote-progress-${state}`;
          const inner = (
            <>
              <span className="quote-progress-rail" aria-hidden="true" />
              <span className="quote-progress-dot" aria-hidden="true">
                {state === "done" ? "✓" : ""}
              </span>
              <span className="quote-progress-label quote-progress-label-short">
                {QUOTE_STATUS_SHORT[step]}
              </span>
              <span className="quote-progress-label quote-progress-label-full">
                {label}
              </span>
            </>
          );
          if (editable && onChange) {
            return (
              <li key={step} className="contents">
                <button
                  type="button"
                  disabled={pending}
                  aria-current={state === "current" ? "step" : undefined}
                  aria-label={label}
                  data-state={state}
                  onClick={() => onChange(step)}
                  className={className}
                >
                  {inner}
                </button>
              </li>
            );
          }
          return (
            <li
              key={step}
              data-state={state}
              aria-current={state === "current" ? "step" : undefined}
              className={className}
            >
              {inner}
            </li>
          );
        })}
      </ol>
      <p className="quote-progress-caption">{quoteStatusCaption(status, role)}</p>
      {editable && onChange ? (
        <button
          type="button"
          disabled={pending || cancelled}
          onClick={() => onChange("cancelled")}
          className={
            cancelled
              ? "btn-danger inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold"
              : "inline-flex h-11 items-center rounded-full px-4 text-sm font-medium text-[var(--spares-danger)]"
          }
        >
          {cancelled ? "Cancelled" : "Cancel quote"}
        </button>
      ) : cancelled ? (
        <p className="text-sm font-medium text-[var(--spares-danger)]">Cancelled</p>
      ) : null}
    </div>
  );
}
