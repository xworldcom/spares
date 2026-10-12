"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { PrefetchLink } from "@/components/nav/PrefetchLink";
import { useMachineName } from "@/components/nav/useMachineName";
import { LoadingState } from "@/components/states/LoadingState";
import { listMachines } from "@/lib/api/machines";
import {
  workListAllHref,
  workListAllLabel,
  workListHubHref,
  workListMachineHref,
  workListMachineIdFromSearchParam,
  workListTitle,
  WORK_LIST_MACHINE_QUERY,
  type WorkListKind,
} from "@/lib/work-list-scope";
import { mergeHrefWithCareTicketsListQuery } from "@/lib/care-tickets-list-query";
import type { Role } from "@/types";

export function WorkListScopeBar({
  kind,
  machineId,
  hubMachineId: hubMachineIdProp,
  hubTicketId,
  hubTicketMachineId,
  role = "customer",
  headingLevel = "h2",
  lede,
  action,
}: {
  kind: WorkListKind;
  /** Machine-scoped route (e.g. /machines/:id/quotes). */
  machineId?: string;
  /** Hub list `?machine=` filter from the parent route. */
  hubMachineId?: string;
  /** Open hub ticket detail — preserved when changing machine filter. */
  hubTicketId?: string;
  hubTicketMachineId?: string;
  role?: Role;
  headingLevel?: "h1" | "h2";
  lede?: string;
  action?: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeScoped = Boolean(machineId);
  const hubMachineId =
    machineId ??
    hubMachineIdProp ??
    workListMachineIdFromSearchParam(searchParams.get(WORK_LIST_MACHINE_QUERY));
  const machineName = useMachineName(hubMachineId ?? null);
  const [machineOptions, setMachineOptions] = useState<{ id: string; name: string }[]>(
    [],
  );
  const allHref = workListAllHref(kind, role);
  const allLabel = workListAllLabel(kind);
  const hubFiltered = Boolean(hubMachineId) && !routeScoped;
  const title = workListTitle(
    kind,
    routeScoped || hubFiltered ? machineName : null,
    routeScoped || hubFiltered,
  );
  const Heading = headingLevel;

  function withTicketsListQuery(href: string) {
    if (kind !== "tickets") {
      return href;
    }
    return mergeHrefWithCareTicketsListQuery(href, searchParams);
  }

  useEffect(() => {
    if (routeScoped) {
      return;
    }
    let cancelled = false;
    listMachines()
      .then((rows) => {
        if (cancelled) {
          return;
        }
        setMachineOptions(
          rows.map((machine) => ({ id: machine.id, name: machine.name })),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setMachineOptions([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [routeScoped]);

  if (routeScoped && !machineName) {
    return (
      <div className="work-list-scope">
        <LoadingState label="Loading…" />
      </div>
    );
  }

  function onPickMachine(nextId: string) {
    if (routeScoped) {
      if (!nextId) {
        return;
      }
      router.push(withTicketsListQuery(workListMachineHref(kind, nextId)));
      return;
    }
    if (kind === "tickets" && hubTicketId) {
      const keepDetail =
        !nextId || (hubTicketMachineId && hubTicketMachineId === nextId);
      if (keepDetail) {
        router.push(
          withTicketsListQuery(
            workListHubHref(kind, role, nextId || undefined, {
              hubTicketId,
            }),
          ),
        );
        return;
      }
    }
    router.push(
      withTicketsListQuery(workListHubHref(kind, role, nextId || undefined)),
    );
  }

  const backHref = routeScoped ? allHref : workListHubHref(kind, role);

  return (
    <div className="work-list-scope">
      {routeScoped || hubFiltered ? (
        <PrefetchLink href={backHref} className="work-list-scope-back">
          <span aria-hidden="true">←</span> {allLabel}
        </PrefetchLink>
      ) : null}
      <div className="work-list-scope-row">
        <div className="work-list-scope-copy">
          <Heading>{title}</Heading>
          {lede ? <p className="work-list-scope-lede">{lede}</p> : null}
          {!routeScoped ? (
            <label className="work-list-scope-filter">
              <select
                className="work-list-scope-filter-select"
                value={hubMachineId ?? ""}
                onChange={(event) => onPickMachine(event.target.value)}
                aria-label="Filter by machine"
              >
                <option value="">All machines</option>
                {machineOptions.map((machine) => (
                  <option key={machine.id} value={machine.id}>
                    {machine.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        {action}
      </div>
    </div>
  );
}
