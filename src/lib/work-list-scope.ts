import { hubTicketsHref, machineTicketsHref } from "./care.ts";
import { machineQuotesHref } from "./machine-context.ts";
import type { Role } from "../types/index.ts";

export type WorkListKind = "quotes" | "tickets";

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
