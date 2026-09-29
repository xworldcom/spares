"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { PrefetchLink } from "@/components/nav/PrefetchLink";
import { useMachineName } from "@/components/nav/useMachineName";
import { listMachines } from "@/lib/api/machines";
import {
  workListAllHref,
  workListAllLabel,
  workListMachineHref,
  workListTitle,
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
  const machineName = useMachineName(machineId ?? null);
  const [machineOptions, setMachineOptions] = useState<{ id: string; name: string }[]>(
    [],
  );
  const allHref = workListAllHref(kind, role);
  const allLabel = workListAllLabel(kind);
  const scoped = Boolean(machineId);
  const title = workListTitle(kind, scoped ? machineName : null, scoped);
  const Heading = headingLevel;

  useEffect(() => {
    if (scoped) {
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
  }, [scoped]);

  function onPickMachine(nextId: string) {
    if (!nextId) {
      return;
    }
    router.push(workListMachineHref(kind, nextId));
  }

  return (
    <div className="work-list-scope">
      {scoped ? (
        <PrefetchLink href={allHref} className="work-list-scope-back">
          <span aria-hidden="true">‹</span> {allLabel}
        </PrefetchLink>
      ) : null}
      <div className="work-list-scope-row">
        <div className="work-list-scope-copy">
          <Heading>{title}</Heading>
          {lede ? <p className="work-list-scope-lede">{lede}</p> : null}
          {!scoped ? (
            <label className="work-list-scope-filter">
              <select
                className="work-list-scope-filter-select"
                value=""
                onChange={(event) => onPickMachine(event.target.value)}
                aria-label={`Show ${kind} for one machine`}
              >
                <option value="" disabled hidden>
                  One machine…
                </option>
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
