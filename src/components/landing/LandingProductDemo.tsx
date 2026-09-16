"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TicketStatusChip } from "@/components/care/TicketStatusChip";
import { TicketStatusStrip } from "@/components/care/TicketStatusStrip";
import { QuoteStatusChip } from "@/components/quote/QuoteStatusChip";
import { QuoteStatusStrip } from "@/components/quote/QuoteStatusStrip";
import { initialsFromEmail } from "@/lib/ui/initials";
import {
  DEMO_DURATION_MS,
  DEMO_MACHINE,
  DEMO_PLANT,
  DEMO_QUOTE_TITLE,
  DEMO_SCRIPT,
  DEMO_TICKET_TITLE,
  demoClockElapsed,
  demoOtherLabel,
  reduceDemoClock,
  type MarketingPerspective,
} from "@/lib/ui/landing-demo";

function useDemoElapsed(resetKey: MarketingPerspective) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduceMotion(reduce);
    if (reduce) {
      setElapsedMs(DEMO_DURATION_MS);
      return;
    }

    const started = performance.now();
    const id = window.setInterval(() => {
      setElapsedMs(performance.now() - started);
    }, 90);
    return () => window.clearInterval(id);
  }, [resetKey]);

  return { elapsedMs: demoClockElapsed(reduceMotion, elapsedMs), reduceMotion };
}

export function LandingProductDemo() {
  const [perspective, setPerspective] = useState<MarketingPerspective>("customer");
  const { elapsedMs, reduceMotion } = useDemoElapsed(perspective);
  const state = useMemo(
    () => reduceDemoClock(DEMO_SCRIPT, elapsedMs, perspective),
    [elapsedMs, perspective],
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

  return (
    <div className="landing-demo">
      <div className="landing-perspective" role="tablist" aria-label="Viewer">
        <button
          type="button"
          role="tab"
          aria-selected={perspective === "customer"}
          className={
            perspective === "customer"
              ? "landing-perspective-btn is-on"
              : "landing-perspective-btn"
          }
          onClick={() => setPerspective("customer")}
        >
          Customer
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={perspective === "staff"}
          className={
            perspective === "staff" ? "landing-perspective-btn is-on" : "landing-perspective-btn"
          }
          onClick={() => setPerspective("staff")}
        >
          Staff (OEM)
        </button>
      </div>

      <div className="landing-demo-stage" data-perspective={perspective}>
        <header className="landing-demo-head">
          <div>
            <p className="landing-demo-kicker">{DEMO_PLANT}</p>
            <h3 className="landing-demo-title">{DEMO_TICKET_TITLE}</h3>
            <p className="landing-demo-meta">{DEMO_MACHINE}</p>
          </div>
          <div className="landing-demo-chips">
            <TicketStatusChip status={state.ticketStatus} current />
            <QuoteStatusChip status={state.quoteStatus} current />
          </div>
        </header>

        <TicketStatusStrip status={state.ticketStatus} editable={false} />
        <div className="landing-demo-quote-strip">
          <p className="landing-demo-quote-label">{DEMO_QUOTE_TITLE}</p>
          <QuoteStatusStrip status={state.quoteStatus} editable={false} role={perspective} />
        </div>

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
    </div>
  );
}
