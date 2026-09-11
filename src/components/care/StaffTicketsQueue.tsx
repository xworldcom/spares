"use client";

import { useEffect, useState } from "react";
import { TicketsList } from "@/components/care/TicketsList";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { listStaffTickets } from "@/lib/api/care";
import { errorMessage } from "@/lib/api/errors";
import type { ServiceTicket } from "@/types";

export function StaffTicketsQueue() {
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listStaffTickets()
      .then((next) => {
        if (cancelled) {
          return;
        }
        setTickets(next);
        setError(null);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        setError(errorMessage(cause, "Could not load tickets."));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  if (loading) {
    return <LoadingState label="Loading tickets…" />;
  }

  if (error) {
    return (
      <ErrorState
        title="Failed to load tickets"
        message={error}
        onRetry={() => {
          setLoading(true);
          setReloadKey((key) => key + 1);
        }}
      />
    );
  }

  return (
    <TicketsList
      tickets={tickets}
      showMachine
      emptyTitle="No service tickets"
      emptyMessage="When a customer opens a ticket on a machine, it will show up here."
    />
  );
}
