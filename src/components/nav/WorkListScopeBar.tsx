"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PrefetchLink } from "@/components/nav/PrefetchLink";
import { useMachineName } from "@/components/nav/useMachineName";
import { listMachines } from "@/lib/api/machines";
import {
  workListAllHref,
  workListMachineHref,
  type WorkListKind,
} from "@/lib/work-list-scope";
import type { Role } from "@/types";

const KIND_LABEL: Record<WorkListKind, string> = {
  quotes: "Quotes",
  tickets: "Tickets",
};

export function WorkListScopeBar({
  kind,
  machineId,
  role = "customer",
}: {
  kind: WorkListKind;
  machineId?: string;
  role?: Role;
}) {
  const router = useRouter();
  const machineName = useMachineName(machineId ?? null);
  const [machineOptions, setMachineOptions] = useState<{ id: string; name: string }[]>(
    [],
  );
  const allHref = workListAllHref(kind, role);
  const scoped = Boolean(machineId);
  const scopeLabel = KIND_LABEL[kind];

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
    <nav className="work-list-scope" aria-label={`${scopeLabel} scope`}>
      <PrefetchLink
        href={allHref}
        className={scoped ? "work-list-scope-seg" : "work-list-scope-seg is-active"}
        aria-current={scoped ? undefined : "page"}
      >
        All machines
      </PrefetchLink>
      {scoped ? (
        <span className="work-list-scope-seg is-active" aria-current="page">
          <span className="work-list-scope-this">This machine</span>
          <span className="work-list-scope-name">{machineName ?? "…"}</span>
        </span>
      ) : (
        <label className="work-list-scope-pick">
          <select
            className="work-list-scope-select"
            value=""
            onChange={(event) => onPickMachine(event.target.value)}
            aria-label={`Show ${scopeLabel.toLowerCase()} for one machine`}
          >
            <option value="" disabled hidden>
              This machine…
            </option>
            {machineOptions.map((machine) => (
              <option key={machine.id} value={machine.id}>
                {machine.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </nav>
  );
}
