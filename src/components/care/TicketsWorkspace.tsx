"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useCareAlerts } from "@/components/care/CareAlerts";
import { NewTicketForm } from "@/components/care/NewTicketForm";
import { TicketDetail } from "@/components/care/TicketDetail";
import { TicketsList } from "@/components/care/TicketsList";
import { useDesktopStage } from "@/components/machine/useDesktopStage";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import {
  listAccessibleTickets,
  listMachineTickets,
} from "@/lib/api/care";
import { errorMessage } from "@/lib/api/errors";
import {
  hubTicketHref,
  machineTicketsHref,
  ticketRefMatches,
} from "@/lib/care";
import { prefetchAppRoute, warmTicketDetail } from "@/lib/nav/prefetch";
import { useMachineName } from "@/components/nav/useMachineName";
import { WorkListScopeBar } from "@/components/nav/WorkListScopeBar";
import type { ServiceTicket } from "@/types";

type TicketsWorkspaceProps = {
  scope: "hub" | "machine";
  machineId?: string;
  ticketId?: string;
};

function ticketHrefFor(scope: TicketsWorkspaceProps["scope"], ticket: ServiceTicket) {
  if (scope === "hub") {
    return hubTicketHref(ticket.id);
  }
  return machineTicketsHref(ticket.machineId, ticket.id);
}

function listHrefFor(scope: TicketsWorkspaceProps["scope"], machineId?: string) {
  if (scope === "hub") {
    return "/care/tickets";
  }
  return machineTicketsHref(machineId ?? "");
}

export function TicketsWorkspace({ scope, machineId, ticketId }: TicketsWorkspaceProps) {
  const router = useRouter();
  const desktop = useDesktopStage();
  const { refresh: refreshCareAlerts } = useCareAlerts();
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const listHref = listHrefFor(scope, machineId);
  const showMachine = scope === "hub";
  const machineName = useMachineName(
    scope === "machine" ? (machineId ?? null) : null,
  );
  const machineIdentityPending =
    scope === "machine" && Boolean(machineId) && !machineName;

  useEffect(() => {
    let cancelled = false;
    const load =
      scope === "machine" && machineId
        ? listMachineTickets(machineId)
        : listAccessibleTickets();
    load
      .then((next) => {
        if (cancelled) {
          return;
        }
        setTickets(next.tickets);
        setError(null);
        setLoading(false);
        void refreshCareAlerts();
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
  }, [scope, machineId, reloadKey, refreshCareAlerts]);

  useEffect(() => {
    if (loading || tickets.length === 0) {
      return;
    }
    const likely = tickets.slice(0, 6);
    for (const ticket of likely) {
      prefetchAppRoute(router, ticketHrefFor(scope, ticket));
      warmTicketDetail(ticket.id);
    }
  }, [loading, router, scope, tickets]);

  function refresh() {
    setReloadKey((key) => key + 1);
  }

  const patchTicketInList = useCallback((patch: ServiceTicket) => {
    setTickets((rows) =>
      rows.map((row) =>
        ticketRefMatches(row, patch.id)
          ? { ...row, unread: patch.unread, viewerReadAt: patch.viewerReadAt }
          : row,
      ),
    );
  }, []);

  function onCreated(id: string, createdMachineId: string) {
    setCreating(false);
    const href =
      scope === "hub"
        ? hubTicketHref(id)
        : machineTicketsHref(createdMachineId, id);
    router.push(href);
    refresh();
  }

  const showList = desktop || !ticketId;
  const showDetail = desktop || Boolean(ticketId);
  const selected = ticketId
    ? tickets.find((ticket) => ticketRefMatches(ticket, ticketId)) ?? null
    : null;

  const listPanel = (
    <div className="tickets-workspace-list">
      <div className="tickets-workspace-toolbar">
        <WorkListScopeBar
          kind="tickets"
          machineId={scope === "machine" ? machineId : undefined}
          headingLevel="h2"
          action={
            <button
              type="button"
              className="btn-primary tickets-workspace-new"
              aria-expanded={creating}
              onClick={() => setCreating((open) => !open)}
            >
              {creating ? "Close" : "New ticket"}
            </button>
          }
        />
      </div>

      {creating ? (
        <NewTicketForm
          machineId={scope === "machine" ? machineId : undefined}
          onCreated={onCreated}
          onCancel={() => setCreating(false)}
        />
      ) : null}

      {machineIdentityPending ? (
        <LoadingState label="Loading…" />
      ) : loading && tickets.length === 0 ? (
        <LoadingState label="Loading tickets…" />
      ) : error && tickets.length === 0 ? (
        <ErrorState
          title="Failed to load tickets"
          message={error}
          onRetry={() => {
            setLoading(true);
            refresh();
          }}
        />
      ) : tickets.length === 0 ? (
        <EmptyState
          title="No tickets yet"
          message={
            scope === "hub"
              ? "Open one when a machine needs service."
              : "Open one when this machine needs service."
          }
        />
      ) : (
        <TicketsList
          tickets={tickets}
          showMachine={showMachine}
          selectedId={ticketId}
          hrefFor={(ticket) => ticketHrefFor(scope, ticket)}
          emptyTitle="No tickets yet"
          emptyMessage="Open one when something needs service."
        />
      )}
    </div>
  );

  const detailPanel = ticketId ? (
    <TicketDetail
      machineId={selected?.machineId ?? machineId ?? ""}
      ticketId={ticketId}
      seedTicket={selected}
      backHref={listHref}
      embedded={desktop}
      onUpdated={refresh}
      onTicketListPatch={patchTicketInList}
    />
  ) : (
    <div className="tickets-workspace-empty">
      <EmptyState
        title="Select a ticket"
        message="Pick one from the list."
      />
    </div>
  );

  return (
    <div
      className="tickets-workspace"
      data-tickets-layout={desktop ? "split" : ticketId ? "detail" : "list"}
    >
      {showList ? listPanel : null}
      {showDetail ? (
        <div className="tickets-workspace-detail">{detailPanel}</div>
      ) : null}
    </div>
  );
}
