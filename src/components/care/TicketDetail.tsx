"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCareAlerts } from "@/components/care/CareAlerts";
import { TicketStatusStrip } from "@/components/care/TicketStatusStrip";
import { ConversationReadWatermark } from "@/components/chat/ConversationReadWatermark";
import { ConversationSheet } from "@/components/chat/ConversationSheet";
import { QuoteActivityFeed } from "@/components/quote/QuoteActivityFeed";
import { conversationPeekLine } from "@/lib/ui/conversation-peek";
import { ErrorState } from "@/components/states/ErrorState";
import {
  getTicket,
  postTicketActivity,
  setTicketAssistantPaused,
  updateTicketStatus,
} from "@/lib/api/care";
import { errorMessage } from "@/lib/api/errors";
import { careHref, ticketContextLine, ticketRefMatches } from "@/lib/care";
import { useConversationWatch } from "@/lib/hooks/useConversationWatch";
import { mergeActivitiesById } from "@/lib/merge-activities";
import type { ChatAttachment, ServiceTicket, TicketCustomerReadReceipt, TicketStatus } from "@/types";

function TicketDetailSkeleton() {
  return (
    <div className="care-stack animate-pulse" aria-busy="true" aria-label="Loading ticket">
      <div className="h-4 w-24 rounded bg-white/10" />
      <div className="space-y-2">
        <div className="h-3 w-20 rounded bg-white/8" />
        <div className="h-8 w-3/4 max-w-md rounded bg-white/12" />
        <div className="h-4 w-full max-w-sm rounded bg-white/8" />
      </div>
      <div className="mt-4 space-y-3 rounded-[22px] bg-white/6 p-4">
        <div className="h-4 w-28 rounded bg-white/10" />
        <div className="h-16 rounded-2xl bg-white/8" />
        <div className="h-16 rounded-2xl bg-white/8" />
      </div>
    </div>
  );
}

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
  onTicketListPatch,
  seedTicket,
}: {
  machineId: string;
  ticketId: string;
  backHref?: string;
  embedded?: boolean;
  onUpdated?: () => void;
  /** Keep the split-pane ticket tree in sync when read state changes. */
  onTicketListPatch?: (ticket: ServiceTicket) => void;
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
  const conversationTitle = "Messages";

  const lastTicketIdRef = useRef<string | null>(null);

  // Paint list row when switching tickets — not when the list row patches read state.
  useEffect(() => {
    const switched = lastTicketIdRef.current !== ticketId;
    lastTicketIdRef.current = ticketId;
    if (!switched || !seedTicket || !ticketRefMatches(seedTicket, ticketId)) {
      return;
    }
    setTicket(seedTicket);
  }, [ticketId, seedTicket]);

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
    const merged = {
      ...ticket,
      status: next.status,
      activities,
      unread: next.unread,
      customerReadReceipts: next.customerReadReceipts,
      assistantPaused: next.assistantPaused,
      assistantAvailable: next.assistantAvailable,
    };
    setTicket(merged);
    onTicketListPatch?.(merged);
  }, [ticket, ticketId, refreshCareAlerts, onTicketListPatch]);

  const threadBump =
    ticket?.activities.at(-1)?.at ?? ticket?.activities.at(-1)?.id ?? ticketId;
  const watermarkReady = Boolean(
    ticket && user && user.role === "customer" && ticketRefMatches(ticket, ticketId),
  );
  useConversationWatch(
    Boolean(ticket && user),
    ticket ? { kind: "ticket", id: ticket.id } : null,
    pollTicket,
  );

  async function onStatus(status: TicketStatus) {
    if (!ticket) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await updateTicketStatus(ticket.id, status);
      setTicket(next);
      onTicketListPatch?.(next);
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
    return <TicketDetailSkeleton />;
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
    return <TicketDetailSkeleton />;
  }

  if (!user) {
    return <TicketDetailSkeleton />;
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
  const contextLine = threadReady ? ticketContextLine(ticket) : null;

  return (
    <div className="care-stack" data-care-ticket-detail="">
      {!embedded ? (
        <Link href={ticketsBack} className="care-back">
          <span aria-hidden="true">‹</span> Tickets
        </Link>
      ) : null}
      {threadReady ? (
        <div className="care-stack-head">
          <div>
            <p className="care-kicker">Ticket {ticket.number}</p>
            <h2 className="text-[28px] font-semibold tracking-tight">{ticket.title}</h2>
            {contextLine ? (
              <p className="care-ticket-detail">{contextLine}</p>
            ) : null}
          </div>
          <TicketStatusStrip
            status={ticket.status}
            editable={staff}
            pending={busy}
            onChange={staff ? onStatus : undefined}
          />
        </div>
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
        title={conversationTitle}
        peekLine={peek.text}
        unread={ticket.unread}
        threadKey={ticket.id}
        layout={embedded ? "inline" : "overlay"}
      >
        <ConversationReadWatermark
          enabled={watermarkReady}
          ticketId={ticketId}
          threadBump={threadBump}
          layout={embedded ? "inline" : "overlay"}
          onRead={(next) => {
            setTicket((current) =>
              current && ticketRefMatches(current, ticketId)
                ? {
                    ...current,
                    unread: next.unread,
                    viewerReadAt: next.viewerReadAt,
                  }
                : current,
            );
            onTicketListPatch?.(next);
            void refreshCareAlerts();
          }}
        />
        <QuoteActivityFeed
          activities={threadReady ? ticket.activities : []}
          role={user.role}
          selfEmail={user.email}
          viewerReadAt={ticket.viewerReadAt}
          busy={busy || !threadReady}
          onSend={onSend}
          threadKind="ticket"
          threadId={ticket.id}
          title={conversationTitle}
          layout={embedded ? "card" : "sheet"}
          customerReadReceipts={staff ? ticket.customerReadReceipts : undefined}
          assistantAvailable={staff ? ticket.assistantAvailable : undefined}
          assistantPaused={ticket.assistantPaused}
          onAssistantPausedChange={staff ? onAssistantPaused : undefined}
        />
      </ConversationSheet>
    </div>
  );
}
