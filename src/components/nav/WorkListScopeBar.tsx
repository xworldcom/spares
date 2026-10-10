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
import type { Role } from "@/types";

export function WorkListScopeBar({
  kind,
  machineId,
  role = "customer",
  headingLevel = "h2",
  lede,
  action,
}: {
  kind: WorkListKind;
  machineId?: string;
  role?: Role;
  headingLevel?: "h1" | "h2";
  lede?: string;
  action?: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hubMachineId =
    machineId ??
    workListMachineIdFromSearchParam(searchParams.get(WORK_LIST_MACHINE_QUERY));
  const machineName = useMachineName(hubMachineId ?? null);
  const [machineOptions, setMachineOptions] = useState<{ id: string; name: string }[]>(
    [],
  );
  const allHref = workListAllHref(kind, role);
  const allLabel = workListAllLabel(kind);
  const routeScoped = Boolean(machineId);
  const hubFiltered = Boolean(hubMachineId);
  const title = workListTitle(kind, hubFiltered ? machineName : null, hubFiltered);
  const Heading = headingLevel;

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
      router.push(workListMachineHref(kind, nextId));
      return;
    }
    router.push(workListHubHref(kind, role, nextId || undefined));
  }

  const backHref = routeScoped ? allHref : workListHubHref(kind, role);

  return (
    <div className="work-list-scope">
      {routeScoped || hubFiltered ? (
        <PrefetchLink href={backHref} className="work-list-scope-back">
          <span aria-hidden="true">‹</span> {allLabel}
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
