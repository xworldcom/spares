"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { TicketStatusChip } from "@/components/care/TicketStatusChip";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { formatDay } from "@/components/quote/quote-format";
import { getCareOverview } from "@/lib/api/care";
import { errorMessage } from "@/lib/api/errors";
import { careHref, machineTicketsHref } from "@/lib/care";
import { siteLabel } from "@/lib/access";
import type { CareOverview, ServiceTicket } from "@/types";

export function CareOverviewPanel({ machineId }: { machineId: string }) {
  const { user } = useAuth();
  const [overview, setOverview] = useState<CareOverview | null>(null);
  const [recent, setRecent] = useState<ServiceTicket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const staff = user?.role === "staff";

  useEffect(() => {
    let cancelled = false;
    getCareOverview(machineId)
      .then((data) => {
        if (cancelled) {
          return;
        }
        setOverview(data.overview);
        setRecent(data.recentTickets ?? []);
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
        <Link href={careHref(machineId, "manuals")} className="care-stat">
          <span className="care-stat-value">{overview.manuals}</span>
          <span className="care-stat-label">
            {overview.manuals === 1 ? "Manual" : "Manuals"}
          </span>
        </Link>
        <Link href={careHref(machineId, "tickets")} className="care-stat">
          <span className="care-stat-value">{overview.ticketsOpen}</span>
          <span className="care-stat-label">
            Open {overview.ticketsOpen === 1 ? "ticket" : "tickets"}
          </span>
          <span className="care-stat-meta">{overview.ticketsTotal} total</span>
        </Link>
        {staff ? (
          <Link href={careHref(machineId, "usage")} className="care-stat">
            <span className="care-stat-value">
              {overview.usage?.hours ?? "—"}
            </span>
            <span className="care-stat-label">Hours</span>
            <span className="care-stat-meta">
              {overview.usage?.lastServiceAt
                ? `Serviced ${formatDay(overview.usage.lastServiceAt)}`
                : "No service date yet"}
            </span>
          </Link>
        ) : null}
      </section>

      {plant ? <p className="spares-muted text-sm">{plant}</p> : null}

      <section className="care-card">
        <header className="care-card-head">
          <h2>Recent tickets</h2>
          <Link href={careHref(machineId, "tickets")}>All tickets</Link>
        </header>
        {recent.length === 0 ? (
          <p className="spares-muted text-sm leading-relaxed">
            No service tickets yet. Open one from Tickets if something needs
            attention.
          </p>
        ) : (
          <ul className="care-list">
            {recent.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  href={machineTicketsHref(machineId, ticket.id)}
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
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
