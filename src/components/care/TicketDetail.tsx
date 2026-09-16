"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCareAlerts } from "@/components/care/CareAlerts";
import { TicketStatusStrip } from "@/components/care/TicketStatusStrip";
import { ConversationSheet } from "@/components/chat/ConversationSheet";
import { QuoteActivityFeed } from "@/components/quote/QuoteActivityFeed";
import { conversationPeekLine } from "@/lib/ui/conversation-peek";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import {
  getTicket,
  postTicketActivity,
  updateTicketStatus,
} from "@/lib/api/care";
import { errorMessage } from "@/lib/api/errors";
import { careHref } from "@/lib/care";
import { useConversationPoll } from "@/lib/hooks/useConversationPoll";
import { mergeActivitiesById } from "@/lib/merge-activities";
import type { ChatAttachment, ServiceTicket, TicketStatus } from "@/types";

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

  const pollTicket = useCallback(async () => {
    if (busy) {
      return;
    }
    const next = await getTicket(ticketId);
    if (!ticket || ticket.id !== ticketId) {
      setTicket(next);
      void refreshCareAlerts();
      return;
    }
    const { activities, changed } = mergeActivitiesById(ticket.activities, next.activities);
    if (!changed && ticket.status === next.status && ticket.unread === next.unread) {
      return;
    }
    void refreshCareAlerts();
    setTicket({
      ...ticket,
      status: next.status,
      activities,
      unread: next.unread,
    });
  }, [busy, ticket, ticketId, refreshCareAlerts]);

  useConversationPoll(Boolean(ticket && user), pollTicket);

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

  async function onSend(input: { text: string; attachments?: ChatAttachment[] }) {
    if (!ticket || !user) {
      return;
    }
    const tempId = `pending-${Date.now()}`;
    const temp = {
      id: tempId,
      at: new Date().toISOString(),
      actorRole: user.role,
      actorEmail: user.email,
      kind: "message" as const,
      text: input.text,
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    };
    setTicket({ ...ticket, activities: [...ticket.activities, temp] });
    setBusy(true);
    setError(null);
    try {
      setTicket(await postTicketActivity(ticket.id, input));
      onUpdated?.();
    } catch (cause) {
      setTicket((current) =>
        current
          ? {
              ...current,
              activities: current.activities.filter((row) => row.id !== tempId),
            }
          : current,
      );
      setError(errorMessage(cause, "Could not send that note."));
      throw cause;
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return <LoadingState label="Loading ticket…" />;
  }

  if (!ticket) {
    if (error) {
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
    return <LoadingState label="Loading ticket…" />;
  }

  const threadReady =
    ticket.id === ticketId || String(ticket.number) === String(ticketId);
  const ticketsBack = backHref ?? careHref(machineId, "tickets");
  const peek =
    threadReady && user
      ? conversationPeekLine(ticket.activities, {
          email: user.email,
          role: user.role,
        })
      : { text: "Loading…", unreadHint: false };

  return (
    <div className="care-stack">
      {!embedded ? (
        <Link href={ticketsBack} className="care-back">
          <span aria-hidden="true">‹</span> Tickets
        </Link>
      ) : null}
      {threadReady ? (
        <>
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
        </>
      ) : (
        <div className="h-24" aria-busy="true" aria-label="Loading conversation" />
      )}
      {error ? (
        <p className="text-sm text-[#f0c4c0]" role="alert">
          {error}
        </p>
      ) : null}
      {embedded ? null : <div className="conversation-sheet-spacer" aria-hidden="true" />}
      <ConversationSheet
        title="Notes"
        peekLine={peek.text}
        unread={ticket.unread}
        layout={embedded ? "inline" : "overlay"}
      >
        <QuoteActivityFeed
          activities={threadReady ? ticket.activities : []}
          role={user.role}
          selfEmail={user.email}
          busy={busy || !threadReady}
          onSend={onSend}
          threadKind="ticket"
          threadId={ticket.id}
          title="Notes"
          layout="sheet"
        />
      </ConversationSheet>
    </div>
  );
}
