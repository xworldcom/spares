"use client";

import { useEffect, useMemo, useRef } from "react";
import { TicketStatusChip } from "@/components/care/TicketStatusChip";
import { TicketStatusStrip } from "@/components/care/TicketStatusStrip";
import { QuoteStatusChip } from "@/components/quote/QuoteStatusChip";
import { QuoteStatusStrip } from "@/components/quote/QuoteStatusStrip";
import { initialsFromEmail } from "@/lib/ui/initials";
import {
  DEMO_MACHINE,
  DEMO_PLANT,
  DEMO_QUOTE_TITLE,
  DEMO_TICKET_TITLE,
  demoClockElapsed,
  demoDurationMs,
  demoOtherLabel,
  demoScript,
  reduceDemoClock,
  type LandingDemoVariant,
  type MarketingPerspective,
} from "@/lib/ui/landing-demo";

type LandingProductDemoProps = {
  variant: LandingDemoVariant;
  perspective: MarketingPerspective;
  elapsedMs: number;
  reduceMotion: boolean;
};

export function LandingProductDemo({
  variant,
  perspective,
  elapsedMs,
  reduceMotion,
}: LandingProductDemoProps) {
  const durationMs = demoDurationMs(variant);
  const script = demoScript(variant);
  const clockMs = demoClockElapsed(reduceMotion, elapsedMs, durationMs);
  const state = useMemo(
    () => reduceDemoClock(script, clockMs, perspective),
    [script, clockMs, perspective],
  );
  const otherLabel = demoOtherLabel(perspective);
  const enteringId = reduceMotion ? null : state.rows.at(-1)?.id;
  const threadRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) {
      return;
    }
    thread.scrollTop = thread.scrollHeight;
  }, [state.rows.length, perspective]);

  const isQuote = variant === "quote";

  return (
    <div className="landing-demo-stage" data-perspective={perspective} data-demo={variant}>
      <header className="landing-demo-head">
        <div>
          <p className="landing-demo-kicker">{DEMO_PLANT}</p>
          <h3 className="landing-demo-title">
            {isQuote ? DEMO_QUOTE_TITLE : DEMO_TICKET_TITLE}
          </h3>
          {isQuote ? null : <p className="landing-demo-meta">{DEMO_MACHINE}</p>}
        </div>
        <div className="landing-demo-chips">
          {isQuote ? (
            <QuoteStatusChip status={state.quoteStatus} current />
          ) : (
            <TicketStatusChip status={state.ticketStatus} current />
          )}
        </div>
      </header>

      {isQuote ? (
        <QuoteStatusStrip status={state.quoteStatus} editable={false} role={perspective} />
      ) : (
        <TicketStatusStrip status={state.ticketStatus} editable={false} />
      )}

      <ol ref={threadRef} className="imsg-thread landing-demo-thread" aria-live="polite">
        {state.rows.map((row) => {
          if (row.kind === "system") {
            return (
              <li
                key={row.id}
                className={enteringId === row.id ? "imsg-system imsg-enter" : "imsg-system"}
              >
                <span className="imsg-chip">{row.text}</span>
              </li>
            );
          }

          const own = row.lane === "own";
          return (
            <li
              key={row.id}
              data-stacked={row.stacked ? "true" : "false"}
              data-end={row.lastInStack ? "true" : "false"}
              className={[
                "imsg-row",
                own ? "imsg-own" : "imsg-other",
                enteringId === row.id ? "imsg-enter" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {own ? null : row.lastInStack ? (
                <span className="imsg-avatar" aria-hidden="true">
                  {initialsFromEmail(row.actorEmail)}
                </span>
              ) : (
                <span className="imsg-avatar-spacer" aria-hidden="true" />
              )}
              <div className="imsg-stack">
                {row.stacked ? null : (
                  <p className="imsg-meta">{own ? "You" : otherLabel}</p>
                )}
                <div className="imsg-bubble">
                  <p className="imsg-text">{row.text}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
