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
  setTicketAssistantPaused,
  updateTicketStatus,
} from "@/lib/api/care";
import { errorMessage } from "@/lib/api/errors";
import { careHref, ticketRefMatches } from "@/lib/care";
import { useConversationPoll } from "@/lib/hooks/useConversationPoll";
import { useTicketReadWatermark } from "@/lib/hooks/useTicketReadWatermark";
import { mergeActivitiesById } from "@/lib/merge-activities";
import type { ChatAttachment, ServiceTicket, TicketCustomerReadReceipt, TicketStatus } from "@/types";

function sameReadReceipts(
  a: TicketCustomerReadReceipt[] | undefined,
  b: TicketCustomerReadReceipt[] | undefined,
) {
  if (!a?.length && !b?.length) {
    return true;
  }
  if (!a || !b || a.length !== b.length) {
    return false;
  }
  return a.every(
    (row, index) =>
      row.userId === b[index]?.userId && row.readAt === b[index]?.readAt,
  );
}

export function TicketDetail({
  machineId,
  ticketId,
  backHref,
  embedded = false,
  onUpdated,
  seedTicket,
}: {
  machineId: string;
  ticketId: string;
  backHref?: string;
  embedded?: boolean;
  onUpdated?: () => void;
  /** Row from the tickets list — paints header immediately while detail loads. */
  seedTicket?: ServiceTicket | null;
}) {
  const { user, status: authStatus } = useAuth();
  const { refresh: refreshCareAlerts } = useCareAlerts();
  const [ticket, setTicket] = useState<ServiceTicket | null>(() =>
    seedTicket && ticketRefMatches(seedTicket, ticketId) ? seedTicket : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const staff = user?.role === "staff";

  useEffect(() => {
    if (seedTicket && ticketRefMatches(seedTicket, ticketId)) {
      setTicket(seedTicket);
    }
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
  }, [ticketId, reloadKey, refreshCareAlerts, seedTicket]);

  const pollTicket = useCallback(async () => {
    const next = await getTicket(ticketId);
    if (!ticket || !ticketRefMatches(ticket, ticketId)) {
      setTicket(next);
      void refreshCareAlerts();
      return;
    }
    const { activities, changed } = mergeActivitiesById(ticket.activities, next.activities);
    if (
      !changed &&
      ticket.status === next.status &&
      ticket.unread === next.unread &&
      ticket.assistantPaused === next.assistantPaused &&
      ticket.assistantAvailable === next.assistantAvailable &&
      sameReadReceipts(ticket.customerReadReceipts, next.customerReadReceipts)
    ) {
      return;
    }
    void refreshCareAlerts();
    setTicket({
      ...ticket,
      status: next.status,
      activities,
      unread: next.unread,
      customerReadReceipts: next.customerReadReceipts,
      assistantPaused: next.assistantPaused,
      assistantAvailable: next.assistantAvailable,
    });
  }, [ticket, ticketId, refreshCareAlerts]);

  const threadBump =
    ticket?.activities.at(-1)?.at ?? ticket?.activities.at(-1)?.id ?? ticketId;
  const watermarkReady = Boolean(
    ticket && user && user.role === "customer" && ticketRefMatches(ticket, ticketId),
  );
  useTicketReadWatermark(watermarkReady, ticketId, threadBump);

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

  async function onAssistantPaused(paused: boolean) {
    if (!ticket) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setTicket(await setTicketAssistantPaused(ticket.id, paused));
    } catch (cause) {
      setError(errorMessage(cause, "Could not update AI for this chat."));
    } finally {
      setBusy(false);
    }
  }

  async function onSend(input: { text: string; attachments?: ChatAttachment[] }) {
    if (!ticket || !user) {
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

  if (authStatus === "loading" && !ticket) {
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

  if (!user) {
    return <LoadingState label="Loading ticket…" />;
  }

  const threadReady = ticketRefMatches(ticket, ticketId);
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
          customerReadReceipts={staff ? ticket.customerReadReceipts : undefined}
          assistantAvailable={staff ? ticket.assistantAvailable : undefined}
          assistantPaused={ticket.assistantPaused}
          onAssistantPausedChange={staff ? onAssistantPaused : undefined}
        />
      </ConversationSheet>
    </div>
  );
}
