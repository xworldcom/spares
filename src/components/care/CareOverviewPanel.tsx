"use client";

import { PrefetchLink } from "@/components/nav/PrefetchLink";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { TicketStatusChip } from "@/components/care/TicketStatusChip";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { formatDay } from "@/components/quote/quote-format";
import { getCareOverview } from "@/lib/api/care";
import { errorMessage } from "@/lib/api/errors";
import { listQuotes } from "@/lib/api/quotes";
import { careHref, machineTicketsHref } from "@/lib/care";
import { machineQuotesHref } from "@/lib/machine-context";
import { warmCareOverview, warmQuotesList, warmTicketDetail } from "@/lib/nav/prefetch";
import { quoteIsOpen } from "@/lib/quotes";
import { siteLabel } from "@/lib/access";
import type { CareOverview, ServiceTicket } from "@/types";

export function CareOverviewPanel({ machineId }: { machineId: string }) {
  const { user } = useAuth();
  const [overview, setOverview] = useState<CareOverview | null>(null);
  const [recent, setRecent] = useState<ServiceTicket[]>([]);
  const [quotesOpen, setQuotesOpen] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const staff = user?.role === "staff";

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getCareOverview(machineId),
      listQuotes().catch(() => ({ quotes: [] })),
    ])
      .then(([data, quoteData]) => {
        if (cancelled) {
          return;
        }
        setOverview(data.overview);
        setRecent(data.recentTickets ?? []);
        setQuotesOpen(
          quoteData.quotes.filter(
            (quote) => quote.machineId === machineId && quoteIsOpen(quote.status),
          ).length,
        );
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        setError(errorMessage(cause, "Could not load Care."));
      });
    return () => {
      cancelled = true;
    };
  }, [machineId, reloadKey]);

  if (error && !overview) {
    return (
      <ErrorState
        title="Failed to load Care"
        message={error}
        onRetry={() => setReloadKey((key) => key + 1)}
      />
    );
  }

  if (!overview) {
    return <LoadingState label="Loading Care…" />;
  }

  const plant =
    overview.machine.company && overview.machine.siteName
      ? siteLabel({
          company: overview.machine.company,
          name: overview.machine.siteName,
        })
      : "";

  return (
    <div className="care-stack">
      <section className="care-stats">
        <PrefetchLink
          href={careHref(machineId, "manuals")}
          warm={() => warmCareOverview(machineId)}
          className="care-stat"
        >
          <span className="care-stat-value">{overview.manuals}</span>
          <span className="care-stat-label">
            {overview.manuals === 1 ? "Manual" : "Manuals"}
          </span>
        </PrefetchLink>
        <PrefetchLink
          href={machineQuotesHref(machineId)}
          warm={() => warmQuotesList()}
          className="care-stat"
        >
          <span className="care-stat-value">{quotesOpen}</span>
          <span className="care-stat-label">
            Open {quotesOpen === 1 ? "quote" : "quotes"}
          </span>
        </PrefetchLink>
        <PrefetchLink
          href={careHref(machineId, "tickets")}
          warm={() => warmCareOverview(machineId)}
          className="care-stat"
        >
          <span className="care-stat-value">{overview.ticketsOpen}</span>
          <span className="care-stat-label">
            Open {overview.ticketsOpen === 1 ? "ticket" : "tickets"}
          </span>
          <span className="care-stat-meta">{overview.ticketsTotal} total</span>
        </PrefetchLink>
        <PrefetchLink
          href={careHref(machineId, "service")}
          warm={() => warmCareOverview(machineId)}
          className="care-stat"
        >
          <span className="care-stat-value">
            {overview.usage?.lastServiceAt
              ? formatDay(overview.usage.lastServiceAt)
              : "—"}
          </span>
          <span className="care-stat-label">Service</span>
          <span className="care-stat-meta">
            {overview.usage?.notes?.trim()
              ? staff
                ? "Latest visit notes on file"
                : "Latest visit notes from your service team"
              : staff
                ? "Log date and notes on site"
                : "No service visits logged yet"}
          </span>
        </PrefetchLink>
      </section>

      {plant ? <p className="spares-muted text-sm">{plant}</p> : null}

      <section className="care-card">
        <header className="care-card-head">
          <h2>Recent tickets</h2>
          <PrefetchLink href={careHref(machineId, "tickets")}>All tickets</PrefetchLink>
        </header>
        {recent.length === 0 ? (
          <p className="spares-muted text-sm leading-relaxed">
            No tickets yet.
          </p>
        ) : (
          <ul className="care-list">
            {recent.map((ticket) => (
              <li key={ticket.id}>
                <PrefetchLink
                  href={machineTicketsHref(machineId, ticket.id)}
                  warm={() => warmTicketDetail(ticket.id)}
                  className="care-row"
                >
                  <div className="min-w-0 flex-1">
                    <p className="care-row-title">
                      #{ticket.number} · {ticket.title}
                    </p>
                    <p className="spares-muted truncate text-sm">
                      {formatDay(ticket.createdAt)}
                    </p>
                  </div>
                  <TicketStatusChip status={ticket.status} />
                </PrefetchLink>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
