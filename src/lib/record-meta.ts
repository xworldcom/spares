import { jsonEqual } from "./catalog-rebase.ts";
import { quoteItemsEqual } from "./quotes.ts";
import type { QuoteRecord, ServiceTicketRecord } from "@/types";
import type { StoredPartLifecycle } from "./part-lifecycle.ts";

/** Monotonic optimistic-lock token on hot rows (quotes, tickets, lifecycle). */
export type RecordMeta = {
  recordVersion: number;
  lastModifiedAt: string;
  lastModifiedByUserId?: string;
  lastModifiedByName?: string;
};

export type RecordMutationActor = {
  id: string;
  email: string;
  name?: string;
};

const INITIAL_RECORD_VERSION = 1;

export function readRecordVersion(row: { recordVersion?: number }) {
  return typeof row.recordVersion === "number" && row.recordVersion >= 1
    ? row.recordVersion
    : INITIAL_RECORD_VERSION;
}

export function recordMetaFromRow(row: {
  recordVersion?: number;
  lastModifiedAt?: string;
  lastModifiedByUserId?: string;
  lastModifiedByName?: string;
  updatedAt?: string;
  updatedByEmail?: string;
}): RecordMeta {
  return {
    recordVersion: readRecordVersion(row),
    lastModifiedAt:
      row.lastModifiedAt ??
      (typeof row.updatedAt === "string" ? row.updatedAt : new Date(0).toISOString()),
    lastModifiedByUserId: row.lastModifiedByUserId,
    lastModifiedByName:
      row.lastModifiedByName ??
      (typeof row.updatedByEmail === "string" ? row.updatedByEmail : undefined),
  };
}

export function bumpRecordMeta<T extends RecordMeta>(
  prev: T,
  actor?: RecordMutationActor,
  at = new Date().toISOString(),
): T {
  return {
    ...prev,
    recordVersion: readRecordVersion(prev) + 1,
    lastModifiedAt: at,
    lastModifiedByUserId: actor?.id,
    lastModifiedByName: actor?.name?.trim() || actor?.email,
  };
}

export type QuoteConflictField =
  | "status"
  | "items"
  | "shipments"
  | "poNumber"
  | "invoiceNumber"
  | "note";

export function quoteChangedFields(before: QuoteRecord, after: QuoteRecord): QuoteConflictField[] {
  const changed: QuoteConflictField[] = [];
  if (before.status !== after.status) {
    changed.push("status");
  }
  if (!quoteItemsEqual(before.items, after.items)) {
    changed.push("items");
  }
  if (!jsonEqual(before.shipments, after.shipments)) {
    changed.push("shipments");
  }
  if ((before.poNumber ?? "") !== (after.poNumber ?? "")) {
    changed.push("poNumber");
  }
  if ((before.invoiceNumber ?? "") !== (after.invoiceNumber ?? "")) {
    changed.push("invoiceNumber");
  }
  if ((before.note ?? "") !== (after.note ?? "")) {
    changed.push("note");
  }
  return changed;
}

export function quoteTouchedFieldsFromPatch(patch: {
  status?: unknown;
  items?: unknown;
  shipments?: unknown;
  poNumber?: unknown;
  invoiceNumber?: unknown;
  note?: unknown;
}): QuoteConflictField[] {
  const touched: QuoteConflictField[] = [];
  if (patch.status !== undefined) {
    touched.push("status");
  }
  if (patch.items !== undefined) {
    touched.push("items");
  }
  if (patch.shipments !== undefined) {
    touched.push("shipments");
  }
  if (patch.poNumber !== undefined) {
    touched.push("poNumber");
  }
  if (patch.invoiceNumber !== undefined) {
    touched.push("invoiceNumber");
  }
  if (patch.note !== undefined) {
    touched.push("note");
  }
  return touched;
}

export function fieldsOverlap<T extends string>(a: readonly T[], b: readonly T[]) {
  const set = new Set(a);
  return b.some((field) => set.has(field));
}

export function quoteOnlyReadWatermarkChange(before: QuoteRecord, after: QuoteRecord) {
  const contentSame =
    before.status === after.status &&
    quoteItemsEqual(before.items, after.items) &&
    jsonEqual(before.shipments, after.shipments) &&
    (before.poNumber ?? "") === (after.poNumber ?? "") &&
    (before.invoiceNumber ?? "") === (after.invoiceNumber ?? "") &&
    (before.note ?? "") === (after.note ?? "") &&
    before.activities.length === after.activities.length;
  return contentSame && !jsonEqual(before.lastReadAt, after.lastReadAt);
}

export function stampQuoteRecord(
  before: QuoteRecord,
  after: QuoteRecord,
  actor?: RecordMutationActor,
  at = new Date().toISOString(),
): QuoteRecord {
  if (quoteOnlyReadWatermarkChange(before, after)) {
    return after;
  }
  if (
    before.status === after.status &&
    quoteItemsEqual(before.items, after.items) &&
    jsonEqual(before.shipments, after.shipments) &&
    (before.poNumber ?? "") === (after.poNumber ?? "") &&
    (before.invoiceNumber ?? "") === (after.invoiceNumber ?? "") &&
    (before.note ?? "") === (after.note ?? "") &&
    jsonEqual(before.lastReadAt, after.lastReadAt) &&
    before.activities.length === after.activities.length
  ) {
    return after;
  }
  return {
    ...after,
    recordVersion: readRecordVersion(before) + 1,
    lastModifiedAt: at,
    lastModifiedByUserId: actor?.id,
    lastModifiedByName: actor?.name?.trim() || actor?.email,
  };
}

export type TicketConflictField = "status" | "title";

export function ticketChangedFields(
  before: ServiceTicketRecord,
  after: ServiceTicketRecord,
): TicketConflictField[] {
  const changed: TicketConflictField[] = [];
  if (before.status !== after.status) {
    changed.push("status");
  }
  if (before.title !== after.title) {
    changed.push("title");
  }
  return changed;
}

export function ticketOnlyReadWatermarkChange(
  before: ServiceTicketRecord,
  after: ServiceTicketRecord,
) {
  const contentSame =
    before.status === after.status &&
    before.title === after.title &&
    before.activities.length === after.activities.length;
  return contentSame && !jsonEqual(before.lastReadAt, after.lastReadAt);
}

export function stampTicketRecord(
  before: ServiceTicketRecord,
  after: ServiceTicketRecord,
  actor?: RecordMutationActor,
  at = new Date().toISOString(),
): ServiceTicketRecord {
  if (ticketOnlyReadWatermarkChange(before, after)) {
    return after;
  }
  if (
    before.status === after.status &&
    before.title === after.title &&
    before.activities.length === after.activities.length &&
    jsonEqual(before.lastReadAt, after.lastReadAt)
  ) {
    return after;
  }
  return {
    ...after,
    recordVersion: readRecordVersion(before) + 1,
    lastModifiedAt: at,
    lastModifiedByUserId: actor?.id,
    lastModifiedByName: actor?.name?.trim() || actor?.email,
  };
}

export function lifecycleChangedFields(
  before: StoredPartLifecycle,
  after: StoredPartLifecycle,
): string[] {
  const keys = [
    "status",
    "discontinuationDate",
    "lastTimeBuyDate",
    "successorPartNumber",
    "sourceNotes",
  ] as const;
  return keys.filter((key) => !jsonEqual(before[key], after[key]));
}

export function stampLifecycleRow(
  before: StoredPartLifecycle | undefined,
  after: StoredPartLifecycle,
  actor?: RecordMutationActor,
  at = new Date().toISOString(),
): StoredPartLifecycle {
  if (before && lifecycleChangedFields(before, after).length === 0) {
    return after;
  }
  const version = (before ? readRecordVersion(before) : readRecordVersion(after)) + 1;
  return {
    ...after,
    recordVersion: version,
    lastModifiedAt: at,
    updatedAt: at,
    updatedByEmail: actor?.email ?? after.updatedByEmail,
    lastModifiedByUserId: actor?.id,
    lastModifiedByName: actor?.name?.trim() || actor?.email,
  };
}
