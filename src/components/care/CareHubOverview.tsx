"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { listAccessibleTickets } from "@/lib/api/care";
import { errorMessage } from "@/lib/api/errors";
import { listMachines } from "@/lib/api/machines";
import { careHref, hubTicketsHref, ticketIsOpen } from "@/lib/care";
import type { MachineSummary } from "@/types";

export function CareHubOverview() {
  const [machines, setMachines] = useState<MachineSummary[]>([]);
  const [openTickets, setOpenTickets] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listMachines(), listAccessibleTickets()])
      .then(([machineRows, tickets]) => {
        if (cancelled) {
          return;
        }
        setMachines(machineRows);
        setOpenTickets(tickets.filter((ticket) => ticketIsOpen(ticket.status)).length);
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
        <Link href={hubTicketsHref()} className="care-stat">
          <span className="care-stat-value">{openTickets}</span>
          <span className="care-stat-label">
            Open {openTickets === 1 ? "ticket" : "tickets"}
          </span>
          <span className="care-stat-meta">Across all machines</span>
        </Link>
        <div className="care-stat">
          <span className="care-stat-value">{machines.length}</span>
          <span className="care-stat-label">
            {machines.length === 1 ? "Machine" : "Machines"}
          </span>
          <span className="care-stat-meta">Manuals and usage per machine</span>
        </div>
      </section>

      <section className="care-card">
        <header className="care-card-head">
          <h2>Machines</h2>
          <Link href={hubTicketsHref()}>All tickets</Link>
        </header>
        {machines.length === 0 ? (
          <p className="spares-muted text-sm leading-relaxed">
            No machines are assigned to your plant yet.
          </p>
        ) : (
          <ul className="care-list">
            {machines.map((machine) => (
              <li key={machine.id}>
                <Link href={careHref(machine.id)} className="care-row">
                  <div className="min-w-0 flex-1">
                    <p className="care-row-title">{machine.name}</p>
                    <p className="spares-muted truncate text-sm">
                      Manuals, tickets, and notes
                    </p>
                  </div>
                  <span className="spares-muted text-lg" aria-hidden="true">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
