"use client";

import { useEffect, useRef } from "react";
import {
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_SHORT,
  ticketStepState,
} from "@/lib/care";
import { scrollCurrentInTrack } from "@/lib/ui/scroll-current-in-track";
import type { TicketStatus } from "@/types";

export function TicketStatusStrip({
  status,
  editable,
  pending,
  onChange,
}: {
  status: TicketStatus;
  editable: boolean;
  pending?: boolean;
  onChange?: (status: TicketStatus) => void;
}) {
  const trackRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    scrollCurrentInTrack(trackRef.current);
  }, [status]);

  return (
    <div className="quote-progress">
      <ol ref={trackRef} className="quote-progress-track" aria-label="Ticket status">
        {TICKET_STATUSES.map((step) => {
          const state = ticketStepState(status, step);
          const label = TICKET_STATUS_LABELS[step];
          const className = `quote-progress-step quote-progress-${state}`;
          const inner = (
            <>
              <span className="quote-progress-rail" aria-hidden="true" />
              <span className="quote-progress-dot" aria-hidden="true">
                {state === "done" ? "✓" : ""}
              </span>
              <span className="quote-progress-label quote-progress-label-short">
                {TICKET_STATUS_SHORT[step]}
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
    </div>
  );
}
