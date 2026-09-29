"use client";

import { PrefetchLink } from "@/components/nav/PrefetchLink";
import { useEffect, useMemo, useState } from "react";
import { TicketStatusChip } from "@/components/care/TicketStatusChip";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { listAccessibleTickets } from "@/lib/api/care";
import { errorMessage } from "@/lib/api/errors";
import { listMachines } from "@/lib/api/machines";
import { hubTicketsHref, machineTicketsHref, ticketIsOpen } from "@/lib/care";
import { machineTabHref } from "@/lib/machine-context";
import { warmCareHubLists, warmTicketDetail } from "@/lib/nav/prefetch";
import { formatDay } from "@/components/quote/quote-format";
import type { MachineSummary, ServiceTicket } from "@/types";

export function CareHubOverview() {
  const [machines, setMachines] = useState<MachineSummary[]>([]);
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    warmCareHubLists();
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listMachines(), listAccessibleTickets()])
      .then(([machineRows, ticketData]) => {
        if (cancelled) {
          return;
        }
        setMachines(machineRows);
        setTickets(ticketData.tickets);
        setError(null);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        setError(errorMessage(cause, "Could not load Care."));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const openTickets = useMemo(
    () => tickets.filter((ticket) => ticketIsOpen(ticket.status)),
    [tickets],
  );

  if (loading) {
    return <LoadingState label="Loading Care…" />;
  }

  if (error) {
    return (
      <ErrorState
        title="Failed to load Care"
        message={error}
        onRetry={() => {
          setLoading(true);
          setReloadKey((key) => key + 1);
        }}
      />
    );
  }

  return (
    <div className="care-stack">
      <section className="care-stats">
        <PrefetchLink href={hubTicketsHref()} className="care-stat">
          <span className="care-stat-value">{openTickets.length}</span>
          <span className="care-stat-label">
            Open {openTickets.length === 1 ? "ticket" : "tickets"}
          </span>
          <span className="care-stat-meta">Across all machines</span>
        </PrefetchLink>
        <div className="care-stat">
          <span className="care-stat-value">{machines.length}</span>
          <span className="care-stat-label">
            {machines.length === 1 ? "Machine" : "Machines"}
          </span>
        </div>
      </section>

      <section className="care-card">
        <header className="care-card-head">
          <h2>Open tickets</h2>
          <PrefetchLink href={hubTicketsHref()}>All tickets</PrefetchLink>
        </header>
        {openTickets.length === 0 ? (
          <p className="spares-muted text-sm leading-relaxed">
            Nothing open.
          </p>
        ) : (
          <ul className="care-list">
            {openTickets.slice(0, 8).map((ticket) => (
              <li key={ticket.id}>
                <PrefetchLink
                  href={machineTicketsHref(ticket.machineId, ticket.id)}
                  warm={() => warmTicketDetail(ticket.id)}
                  className="care-row"
                >
                  <div className="min-w-0 flex-1">
                    <p className="care-row-title">
                      #{ticket.number} · {ticket.title}
                    </p>
                    <p className="spares-muted truncate text-sm">
                      {formatDay(ticket.createdAt)}
                      {ticket.machineName ? ` · ${ticket.machineName}` : ""}
                    </p>
                  </div>
                  <TicketStatusChip status={ticket.status} />
                </PrefetchLink>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="care-card">
        <header className="care-card-head">
          <h2>Machines</h2>
          <PrefetchLink href="/machines">All machines</PrefetchLink>
        </header>
        {machines.length === 0 ? (
          <p className="spares-muted text-sm leading-relaxed">
            No machines yet.
          </p>
        ) : (
          <ul className="care-machine-chips">
            {machines.map((machine) => (
              <li key={machine.id}>
                <PrefetchLink
                  href={machineTabHref(machine.id, "model")}
                  className="care-machine-chip"
                >
                  {machine.name}
                </PrefetchLink>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
