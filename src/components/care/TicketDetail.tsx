"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCareAlerts } from "@/components/care/CareAlerts";
import { TicketStatusStrip } from "@/components/care/TicketStatusStrip";
import { QuoteActivityFeed } from "@/components/quote/QuoteActivityFeed";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import {
  getTicket,
  postTicketActivity,
  updateTicketStatus,
} from "@/lib/api/care";
import { errorMessage } from "@/lib/api/errors";
import { careHref } from "@/lib/care";
import type { ServiceTicket, TicketStatus } from "@/types";

export function TicketDetail({
  machineId,
  ticketId,
  backHref,
  embedded = false,
  onUpdated,
}: {
  machineId: string;
  ticketId: string;
  backHref?: string;
  embedded?: boolean;
  onUpdated?: () => void;
}) {
  const { user } = useAuth();
  const { refresh: refreshCareAlerts } = useCareAlerts();
  const [ticket, setTicket] = useState<ServiceTicket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const staff = user?.role === "staff";

  useEffect(() => {
    setTicket(null);
    setError(null);
    let cancelled = false;
    getTicket(ticketId)
      .then((next) => {
        if (cancelled) {
          return;
        }
        setTicket(next);
        setError(null);
        void refreshCareAlerts();
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        setError(errorMessage(cause, "Could not load this ticket."));
      });
    return () => {
      cancelled = true;
    };
  }, [ticketId, reloadKey, refreshCareAlerts]);

  async function onStatus(status: TicketStatus) {
    if (!ticket) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setTicket(await updateTicketStatus(ticket.id, status));
      onUpdated?.();
    } catch (cause) {
      setError(errorMessage(cause, "Could not update status."));
    } finally {
      setBusy(false);
    }
  }

  async function onSend(input: { text: string; attachments?: import("@/types").ChatAttachment[] }) {
    if (!ticket) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setTicket(await postTicketActivity(ticket.id, input));
      onUpdated?.();
    } catch (cause) {
      setError(errorMessage(cause, "Could not send that note."));
      throw cause;
    } finally {
      setBusy(false);
    }
  }

  if (error && !ticket) {
    return (
      <ErrorState
        title="Failed to load ticket"
        message={error}
        onRetry={() => {
          setError(null);
          setReloadKey((key) => key + 1);
        }}
      />
    );
  }

  if (!ticket || !user) {
    return <LoadingState label="Loading ticket…" />;
  }

  const ticketsBack = backHref ?? careHref(machineId, "tickets");

  return (
    <div className="care-stack">
      {!embedded ? (
        <Link href={ticketsBack} className="care-back">
          <span aria-hidden="true">‹</span> Tickets
        </Link>
      ) : null}
      <div>
        <p className="care-kicker">Ticket {ticket.number}</p>
        <h2 className="text-[28px] font-semibold tracking-tight">{ticket.title}</h2>
      </div>
      <TicketStatusStrip
        status={ticket.status}
        editable={staff}
        pending={busy}
        onChange={staff ? onStatus : undefined}
      />
      {error ? (
        <p className="text-sm text-[#f0c4c0]" role="alert">
          {error}
        </p>
      ) : null}
      <QuoteActivityFeed
        activities={ticket.activities}
        role={user.role}
        selfEmail={user.email}
        busy={busy}
        onSend={onSend}
        threadKind="ticket"
        threadId={ticket.id}
        title="Notes"
        subtitle="iMessage-style chatter on this machine. Status changes land as quiet chips."
      />
    </div>
  );
}
