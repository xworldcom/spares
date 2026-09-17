"use client";

import { useMemo } from "react";
import { TicketStatusChip } from "@/components/care/TicketStatusChip";
import { TicketStatusStrip } from "@/components/care/TicketStatusStrip";
import { QuoteStatusChip } from "@/components/quote/QuoteStatusChip";
import { QuoteStatusStrip } from "@/components/quote/QuoteStatusStrip";
import { initialsFromEmail } from "@/lib/ui/initials";
import {
  DEMO_MACHINE,
  DEMO_OTHER_LABEL,
  DEMO_PLANT,
  DEMO_QUOTE_NUMBER,
  DEMO_QUOTE_TITLE,
  DEMO_TICKET_NUMBER,
  DEMO_TICKET_TITLE,
  demoPlayhead,
  demoRowHidden,
  reduceDemoFrame,
  type DemoTreeRow,
  type LandingDemoVariant,
} from "@/lib/ui/landing-demo";

function DemoTree({
  variant,
  rows,
}: {
  variant: LandingDemoVariant;
  rows: DemoTreeRow[];
}) {
  const isQuote = variant === "quote";
  return (
    <aside className="landing-demo-tree" aria-label={isQuote ? "Quotes" : "Tickets"}>
      <div className="landing-demo-tree-head">
        <h3 className="landing-demo-tree-title">{isQuote ? "Quotes" : "Tickets"}</h3>
        <p className="landing-demo-tree-lede">
          {isQuote ? "Requested from a machine." : "Service on the cell."}
        </p>
      </div>
      <ul className="landing-demo-tree-list">
        {rows.map((row) => (
          <li key={row.id}>
            <div
              className={row.featured ? "landing-demo-tree-row is-selected" : "landing-demo-tree-row"}
              aria-current={row.featured ? "true" : undefined}
            >
              {row.unread ? (
                <span className="landing-demo-tree-unread" aria-label="Unread" />
              ) : (
                <span className="landing-demo-tree-unread-spacer" aria-hidden="true" />
              )}
              <div className="landing-demo-tree-copy">
                <p className="landing-demo-tree-name">
                  {isQuote ? `Quote ${row.number}` : `Ticket ${row.number}`}
                  <span className="landing-demo-tree-name-rest"> · {row.title}</span>
                </p>
                <p className="landing-demo-tree-meta">{row.meta}</p>
              </div>
              {isQuote && row.quoteStatus ? (
                <QuoteStatusChip status={row.quoteStatus} current={row.featured} />
              ) : null}
              {!isQuote && row.ticketStatus ? (
                <TicketStatusChip status={row.ticketStatus} current={row.featured} />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function LandingProductDemo({
  variant,
  progress,
  reduceMotion,
  scrubbed = false,
}: {
  variant: LandingDemoVariant;
  progress: number;
  reduceMotion: boolean;
  scrubbed?: boolean;
}) {
  const playhead = demoPlayhead(reduceMotion, progress);
  const complete = useMemo(() => reduceDemoFrame(variant, 1), [variant]);
  const state = useMemo(() => reduceDemoFrame(variant, playhead), [variant, playhead]);
  const liveById = useMemo(() => new Map(state.rows.map((row) => [row.id, row])), [state.rows]);
  const rows = scrubbed
    ? complete.rows.map((row) => liveById.get(row.id) ?? row)
    : state.rows;
  const enteringId = reduceMotion ? null : state.appearingId;
  const isQuote = variant === "quote";

  return (
    <div className="landing-demo-stage" data-demo={variant}>
      <div className="landing-demo-workspace">
        <DemoTree variant={variant} rows={state.tree} />
        <div className="landing-demo-main">
          <header className="landing-demo-head">
            <div>
              <p className="landing-demo-kicker">{DEMO_PLANT}</p>
              <h3 className="landing-demo-title">
                {isQuote ? `Quote ${DEMO_QUOTE_NUMBER}` : `Ticket ${DEMO_TICKET_NUMBER}`}
              </h3>
              <p className="landing-demo-meta">
                {isQuote ? `${DEMO_QUOTE_TITLE} · ${DEMO_MACHINE}` : DEMO_MACHINE}
              </p>
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
            <QuoteStatusStrip status={state.quoteStatus} editable={false} role="customer" />
          ) : (
            <TicketStatusStrip status={state.ticketStatus} editable={false} />
          )}

          <ol
            className="imsg-thread landing-demo-thread"
            aria-live={scrubbed ? "off" : "polite"}
            data-scrubbed={scrubbed || undefined}
          >
            {rows.map((row) => {
              if (row.kind === "system") {
                return (
                  <li
                    key={row.id}
                    data-demo-at={row.at}
                    hidden={scrubbed ? demoRowHidden(row.at, playhead) : false}
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
                  data-demo-at={row.at}
                  hidden={scrubbed ? demoRowHidden(row.at, playhead) : false}
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
                      <p className="imsg-meta">{own ? "You" : DEMO_OTHER_LABEL}</p>
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
    </div>
  );
}
