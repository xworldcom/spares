import type { ServiceTicketRecord } from "@/types";
import type { TicketStatus } from "./care.ts";
import {
  fieldsOverlap,
  readRecordVersion,
  ticketChangedFields,
  type TicketConflictField,
} from "./record-meta.ts";

/** Client field snapshot on PATCH (from last read or successful write response). */
export type TicketStatusClientSnapshot = {
  expectedVersion: number;
  baseStatus: TicketStatus;
};

/**
 * C-H1 one-sentence CAS: 409 only when the same field changed since the client
 * snapshot by a different writer. Version-only drift with unchanged fields is allowed.
 */
export function ticketStatusCasWouldConflict(
  current: ServiceTicketRecord,
  client: TicketStatusClientSnapshot,
  actorId?: string,
  touchedFields: readonly TicketConflictField[] = ["status"],
): boolean {
  const clientRow: ServiceTicketRecord = { ...current, status: client.baseStatus };
  const serverFields = ticketChangedFields(clientRow, current);
  if (serverFields.length === 0) {
    return false;
  }
  if (!fieldsOverlap(serverFields, touchedFields)) {
    return false;
  }
  if (actorId && current.lastModifiedByUserId === actorId) {
    return false;
  }
  return true;
}

export type TicketCasDebugSnapshot = {
  expectedVersion: number;
  liveVersion: number;
  clientBaseStatus: TicketStatus;
  liveStatus: TicketStatus;
  lastModifiedByUserId?: string;
  actorId?: string;
  wouldConflict: boolean;
};

export function ticketCasDebugSnapshot(
  current: ServiceTicketRecord,
  client: TicketStatusClientSnapshot,
  actorId?: string,
): TicketCasDebugSnapshot {
  return {
    expectedVersion: client.expectedVersion,
    liveVersion: readRecordVersion(current),
    clientBaseStatus: client.baseStatus,
    liveStatus: current.status,
    lastModifiedByUserId: current.lastModifiedByUserId,
    actorId,
    wouldConflict: ticketStatusCasWouldConflict(current, client, actorId),
  };
}
