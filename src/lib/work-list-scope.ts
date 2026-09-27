import { hubTicketsHref, machineTicketsHref } from "./care.ts";
import { machineQuotesHref } from "./machine-context.ts";
import type { Role } from "../types/index.ts";

export type WorkListKind = "quotes" | "tickets";

export function workListNoun(kind: WorkListKind) {
  return kind === "quotes" ? "quotes" : "tickets";
}

export function workListAllLabel(kind: WorkListKind) {
  return kind === "quotes" ? "All quotes" : "All tickets";
}

export function workListTitle(
  kind: WorkListKind,
  machineName?: string | null,
  scoped = false,
) {
  const name = machineName?.trim();
  if (name) {
    return `${name} ${workListNoun(kind)}`;
  }
  if (scoped) {
    return kind === "quotes" ? "Quotes" : "Tickets";
  }
  return workListAllLabel(kind);
}

export function workListAllHref(kind: WorkListKind, role: Role = "customer") {
  if (kind === "tickets") {
    return hubTicketsHref();
  }
  return role === "staff" ? "/staff/quotes" : "/quotes";
}

export function workListMachineHref(kind: WorkListKind, machineId: string) {
  if (kind === "tickets") {
    return machineTicketsHref(machineId);
  }
  return machineQuotesHref(machineId);
}
