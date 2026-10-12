"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CatalogSearch } from "@/components/catalog/CatalogSearch";
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
import { invalidateListEtag } from "@/lib/api/list-fetch";
import { invalidateWarmRead } from "@/lib/api/warm-read";
import { errorMessage } from "@/lib/api/errors";
import {
  hubTicketHref,
  machineTicketsHref,
  ticketIsOpen,
  ticketRefMatches,
} from "@/lib/care";
import { prefetchAppRoute, warmTicketDetail } from "@/lib/nav/prefetch";
import { useMachineName } from "@/components/nav/useMachineName";
import { DocumentTitle } from "@/components/nav/DocumentTitle";
import { WorkListScopeBar } from "@/components/nav/WorkListScopeBar";
import { workListTitle } from "@/lib/work-list-scope";
import {
  careTicketsSortFromParam,
  careTicketsStatusFromParam,
  CARE_TICKETS_Q_QUERY,
  CARE_TICKETS_SORT_QUERY,
  CARE_TICKETS_STATUS_QUERY,
  filterAndSortCareTickets,
  type CareTicketsSort,
  type CareTicketsStatusFilter,
} from "@/lib/care-tickets-filter";
import {
  workListMachineIdFromSearchParam,
  WORK_LIST_MACHINE_QUERY,
} from "@/lib/work-list-scope";
import { useRequestGeneration } from "@/lib/ui/request-generation";
import type { TicketsListResponse } from "@/lib/api/types";
import type { ServiceTicket } from "@/types";
import { useSeedListSlotOnce } from "@/lib/ui/use-seed-list-slot";
import {
  careTicketsListQueryString,
  hrefWithCareTicketsListQuery,
} from "@/lib/care-tickets-list-query";

const ACCESSIBLE_TICKETS_PATH = "/api/tickets";
const ACCESSIBLE_TICKETS_WARM_KEY = "tickets:accessible";

type TicketsWorkspaceProps = {
  scope: "hub" | "machine";
  machineId?: string;
  ticketId?: string;
  initialList?: TicketsListResponse | null;
  listEtag?: string | null;
};

function ticketHrefFor(
  scope: TicketsWorkspaceProps["scope"],
  ticket: ServiceTicket,
  searchParams: URLSearchParams,
) {
  const base =
    scope === "hub"
      ? hubTicketHref(ticket.id)
      : machineTicketsHref(ticket.machineId, ticket.id);
  return hrefWithCareTicketsListQuery(base, searchParams);
}

function listHrefFor(scope: TicketsWorkspaceProps["scope"], machineId?: string) {
  if (scope === "hub") {
    return "/care/tickets";
  }
  return machineTicketsHref(machineId ?? "");
}

export function TicketsWorkspace({
  scope,
  machineId,
  ticketId,
  initialList,
  listEtag,
}: TicketsWorkspaceProps) {
  useSeedListSlotOnce(
    ACCESSIBLE_TICKETS_WARM_KEY,
    ACCESSIBLE_TICKETS_PATH,
    scope === "hub" ? initialList : null,
    scope === "hub" ? listEtag : null,
  );
  const router = useRouter();
  const searchParams = useSearchParams();
  const hubMachineFromUrl =
    scope === "hub"
      ? workListMachineIdFromSearchParam(searchParams.get(WORK_LIST_MACHINE_QUERY))
      : undefined;
  const desktop = useDesktopStage();
  const { refresh: refreshCareAlerts } = useCareAlerts();
  const hubInitial = scope === "hub" ? initialList : null;
  const [tickets, setTickets] = useState<ServiceTicket[]>(hubInitial?.tickets ?? []);
  const [loading, setLoading] = useState(scope === "hub" ? !hubInitial : true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const listHref = listHrefFor(scope, machineId);
  const scopedMachineName = useMachineName(
    scope === "machine" ? machineId ?? null : hubMachineFromUrl ?? null,
  );
  const ticketsPageTitle = workListTitle(
    "tickets",
    scope === "machine" || hubMachineFromUrl ? scopedMachineName : null,
    scope === "machine" || Boolean(hubMachineFromUrl),
  );
  const listHrefWithQuery = `${listHref}${careTicketsListQueryString(searchParams)}`;
  const hubMachineFilter = scope === "hub" ? hubMachineFromUrl : undefined;
  const showMachine = scope === "hub" && !hubMachineFilter;
  const machineName = useMachineName(
    scope === "machine" ? (machineId ?? null) : null,
  );
  const machineIdentityPending =
    scope === "machine" && Boolean(machineId) && !machineName;
  const { begin, isCurrent } = useRequestGeneration();

  useEffect(() => {
    const generation = begin();
    const skipHubFetch =
      scope === "hub" &&
      Boolean(hubInitial) &&
      (hubInitial?.tickets?.length ?? 0) > 0 &&
      reloadKey === 0;
    const background = reloadKey > 0;
    if (!skipHubFetch && !background) {
      setLoading(true);
    }
    const load =
      scope === "machine" && machineId
        ? listMachineTickets(machineId)
        : skipHubFetch
          ? Promise.resolve({ tickets: hubInitial?.tickets ?? [], unreadCount: hubInitial?.unreadCount ?? 0 })
          : listAccessibleTickets();
    load
      .then((next) => {
        if (!isCurrent(generation)) {
          return;
        }
        setTickets(next.tickets);
        setError(null);
        void refreshCareAlerts();
      })
      .catch((cause: unknown) => {
        if (!isCurrent(generation)) {
          return;
        }
        setError(errorMessage(cause, "Could not load tickets."));
      })
      .finally(() => {
        if (isCurrent(generation)) {
          setLoading(false);
        }
      });
  }, [begin, hubInitial, isCurrent, scope, machineId, reloadKey, refreshCareAlerts]);

  useEffect(() => {
    if (loading || tickets.length === 0) {
      return;
    }
    const likely = tickets.slice(0, 6);
    for (const ticket of likely) {
      prefetchAppRoute(router, ticketHrefFor(scope, ticket, searchParams));
      warmTicketDetail(ticket.id);
    }
  }, [loading, router, scope, searchParams, tickets]);

  function refresh() {
    invalidateListEtag("/api/tickets");
    invalidateWarmRead("tickets:accessible");
    setReloadKey((key) => key + 1);
  }

  const patchTicketInList = useCallback((patch: ServiceTicket) => {
    setTickets((rows) => {
      let changed = false;
      const next = rows.map((row) => {
        if (!ticketRefMatches(row, patch.id)) {
          return row;
        }
        if (
          row.unread === patch.unread &&
          row.viewerReadAt === patch.viewerReadAt &&
          row.status === patch.status &&
          row.recordVersion === patch.recordVersion
        ) {
          return row;
        }
        changed = true;
        return {
          ...row,
          unread: patch.unread,
          viewerReadAt: patch.viewerReadAt,
          status: patch.status,
          recordVersion: patch.recordVersion,
          lastModifiedAt: patch.lastModifiedAt,
          lastModifiedByName: patch.lastModifiedByName,
        };
      });
      return changed ? next : rows;
    });
  }, []);

  function onCreated(id: string, createdMachineId: string) {
    setCreating(false);
    const href =
      scope === "hub"
        ? hubTicketHref(id)
        : machineTicketsHref(createdMachineId, id);
    router.push(hrefWithCareTicketsListQuery(href, searchParams));
    refresh();
  }

  const showList = desktop || !ticketId;
  const showDetail = desktop || Boolean(ticketId);
  const machineScopedTickets = hubMachineFilter
    ? tickets.filter((ticket) => ticket.machineId === hubMachineFilter)
    : tickets;

  const statusFilter = careTicketsStatusFromParam(
    searchParams.get(CARE_TICKETS_STATUS_QUERY),
  );
  const sortKey = careTicketsSortFromParam(
    searchParams.get(CARE_TICKETS_SORT_QUERY),
  );
  const searchQuery = searchParams.get(CARE_TICKETS_Q_QUERY) ?? "";

  const replaceListQuery = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        const trimmed = value?.trim();
        if (!trimmed) {
          next.delete(key);
        } else {
          next.set(key, trimmed);
        }
      }
      const qs = next.toString();
      const path =
        ticketId && scope === "hub"
          ? `${hubTicketHref(ticketId)}${qs ? `?${qs}` : ""}`
          : `${listHref}${qs ? `?${qs}` : ""}`;
      router.replace(path, { scroll: false });
    },
    [listHref, router, scope, searchParams, ticketId],
  );

  const visibleTickets = useMemo(
    () =>
      filterAndSortCareTickets(machineScopedTickets, {
        query: searchQuery,
        status: statusFilter,
        sort: sortKey,
      }),
    [machineScopedTickets, searchQuery, sortKey, statusFilter],
  );

  const selected = ticketId
    ? machineScopedTickets.find((ticket) => ticketRefMatches(ticket, ticketId)) ??
      tickets.find((ticket) => ticketRefMatches(ticket, ticketId)) ??
      null
    : null;

  const listTickets = useMemo(() => {
    if (!selected) {
      return visibleTickets;
    }
    if (visibleTickets.some((ticket) => ticketRefMatches(ticket, selected.id))) {
      return visibleTickets;
    }
    const selectedMatchesFilter =
      statusFilter === "all" ||
      (statusFilter === "open" && ticketIsOpen(selected.status)) ||
      (statusFilter === "closed" && !ticketIsOpen(selected.status));
    if (!selectedMatchesFilter) {
      return visibleTickets;
    }
    return [selected, ...visibleTickets];
  }, [selected, statusFilter, visibleTickets]);

  const listPanel = (
    <div className="tickets-workspace-list">
      <div className="tickets-workspace-toolbar">
        <WorkListScopeBar
          kind="tickets"
          machineId={scope === "machine" ? machineId : undefined}
          hubMachineId={hubMachineFilter}
          hubTicketId={scope === "hub" ? ticketId : undefined}
          hubTicketMachineId={selected?.machineId}
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
      ) : machineScopedTickets.length === 0 &&
        !searchQuery.trim() &&
        statusFilter === "all" ? (
        <EmptyState
          title="No tickets yet"
          message={
            hubMachineFilter
              ? "No tickets for this machine yet."
              : scope === "hub"
                ? "Open one when a machine needs service."
                : "Open one when this machine needs service."
          }
        />
      ) : (
        <>
          <div className="tickets-workspace-filters">
            <CatalogSearch
              id="care-tickets-search"
              label="Search tickets"
              value={searchQuery}
              onChange={(value) =>
                replaceListQuery({ [CARE_TICKETS_Q_QUERY]: value })
              }
              placeholder="Search tickets"
            />
            <div className="tickets-workspace-filter-row">
              {(
                [
                  { value: "all" as CareTicketsStatusFilter, label: "All" },
                  { value: "open" as CareTicketsStatusFilter, label: "Open" },
                  { value: "closed" as CareTicketsStatusFilter, label: "Closed" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={statusFilter === option.value}
                  className={
                    statusFilter === option.value ? "btn-primary" : "btn-soft"
                  }
                  onClick={() =>
                    replaceListQuery({
                      [CARE_TICKETS_STATUS_QUERY]:
                        option.value === "all" ? undefined : option.value,
                    })
                  }
                >
                  {option.label}
                </button>
              ))}
              <label className="tickets-workspace-sort">
                <span className="sr-only">Sort tickets</span>
                <select
                  className="spares-field tickets-workspace-sort-select"
                  value={sortKey}
                  onChange={(event) =>
                    replaceListQuery({
                      [CARE_TICKETS_SORT_QUERY]:
                        event.target.value === "recent"
                          ? undefined
                          : event.target.value,
                    })
                  }
                  aria-label="Sort tickets"
                >
                  <option value="recent">Newest first</option>
                  <option value="updated">Recently updated</option>
                </select>
              </label>
            </div>
          </div>
          {listTickets.length === 0 ? (
            <EmptyState
              title="No matching tickets"
              message={
                searchQuery || statusFilter !== "all"
                  ? "Try a different search or filter."
                  : hubMachineFilter
                    ? "No tickets for this machine yet."
                    : scope === "hub"
                      ? "Open one when a machine needs service."
                      : "Open one when this machine needs service."
              }
            />
          ) : (
            <TicketsList
              tickets={listTickets}
              showMachine={showMachine}
              selectedId={ticketId}
              pinnedOutsideFilterId={
                selected &&
                !visibleTickets.some((ticket) =>
                  ticketRefMatches(ticket, selected.id),
                )
                  ? selected.id
                  : undefined
              }
              hrefFor={(ticket) => ticketHrefFor(scope, ticket, searchParams)}
              emptyTitle="No tickets yet"
              emptyMessage="Open one when something needs service."
            />
          )}
        </>
      )}
    </div>
  );

  const detailPanel = ticketId ? (
    <TicketDetail
      machineId={selected?.machineId ?? machineId ?? ""}
      ticketId={ticketId}
      seedTicket={selected}
      backHref={listHrefWithQuery}
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
      <DocumentTitle title={ticketsPageTitle} />
      {showList ? listPanel : null}
      {showDetail ? (
        <div className="tickets-workspace-detail">{detailPanel}</div>
      ) : null}
    </div>
  );
}
