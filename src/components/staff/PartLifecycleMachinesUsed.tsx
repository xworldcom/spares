"use client";

import type { PartLifecycleStatus } from "@/types";

type Props = {
  machineIds: string[];
  machineNames: string[];
  status?: PartLifecycleStatus | "all";
  query?: string;
  className?: string;
  mutedClassName?: string;
  onFilterMachine?: (machineId: string) => void;
};

export function PartLifecycleMachinesUsed({
  machineIds,
  machineNames,
  status = "all",
  query = "",
  className = "",
  mutedClassName = "spares-muted",
  onFilterMachine,
}: Props) {
  const count = machineIds.length;
  if (count === 0) {
    return (
      <span className={`block text-[12px] ${mutedClassName} ${className}`}>
        Used on (0) — no machines
      </span>
    );
  }

  const label = `Used on (${count})`;

  if (!onFilterMachine) {
    return (
      <span
        className={`mt-0.5 block text-[12px] leading-snug break-words ${mutedClassName} ${className}`}
      >
        <span className="font-medium">{label}</span>
        <span className="font-normal"> · {machineNames.join(" · ")}</span>
      </span>
    );
  }

  return (
    <span
      className={`mt-0.5 block text-[12px] leading-snug break-words ${mutedClassName} ${className}`}
    >
      <span className="font-medium">{label}</span>
      <span className="font-normal">
        {" · "}
        {machineIds.map((machineId, index) => {
          const name = machineNames[index] ?? machineId;
          return (
            <span key={machineId}>
              {index > 0 ? " · " : null}
              <button
                type="button"
                className="underline-offset-2 hover:underline"
                onClick={(event) => {
                  event.stopPropagation();
                  onFilterMachine(machineId);
                }}
              >
                {name}
              </button>
            </span>
          );
        })}
      </span>
    </span>
  );
}
