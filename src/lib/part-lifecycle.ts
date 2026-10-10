import type { Part, UnmatchedPart } from "@/types/index.ts";
import type { StoredMachine } from "./store.ts";
import { isManagedRuntime, isSeedAllowed } from "./production-env.ts";
import { DEFAULT_TENANT_ID } from "./tenant.ts";

/** Durable lifecycle status for a catalog part number (per host tenant). */
export type PartLifecycleStatus = "active" | "announced" | "obsolete" | "unknown";

export type PartLifecycleFields = {
  status: PartLifecycleStatus;
  discontinuationDate?: string;
  lastTimeBuyDate?: string;
  successorPartNumber?: string;
  /** Staff-entered source or internal notes. */
  sourceNotes?: string;
};

export type StoredPartLifecycle = PartLifecycleFields & {
  id: string;
  tenantId: string;
  partNumber: string;
  updatedAt: string;
  updatedByEmail?: string;
};

/** Customer-visible slice (no internal notes). */
export type PublicPartLifecycle = Omit<PartLifecycleFields, "sourceNotes">;

export type TenantPartCatalogRow = {
  partNumber: string;
  name: string;
  machineIds: string[];
  machineNames: string[];
  lifecycle: PartLifecycleFields;
};

const STATUSES: ReadonlySet<PartLifecycleStatus> = new Set([
  "active",
  "announced",
  "obsolete",
  "unknown",
]);

export function normalizePartNumber(partNumber: string) {
  return partNumber.trim();
}

export function partLifecycleRowId(tenantId: string, partNumber: string) {
  return `${tenantId}::${normalizePartNumber(partNumber)}`;
}

export function defaultLifecycleFields(): PartLifecycleFields {
  return { status: "unknown" };
}

export function effectiveLifecycle(
  record: StoredPartLifecycle | undefined,
): PartLifecycleFields {
  if (!record) {
    return defaultLifecycleFields();
  }
  return {
    status: record.status,
    ...(record.discontinuationDate ? { discontinuationDate: record.discontinuationDate } : {}),
    ...(record.lastTimeBuyDate ? { lastTimeBuyDate: record.lastTimeBuyDate } : {}),
    ...(record.successorPartNumber
      ? { successorPartNumber: record.successorPartNumber }
      : {}),
    ...(record.sourceNotes ? { sourceNotes: record.sourceNotes } : {}),
  };
}

export function publicLifecycle(
  fields: PartLifecycleFields,
): PublicPartLifecycle | undefined {
  if (fields.status !== "announced" && fields.status !== "obsolete") {
    return undefined;
  }
  const { sourceNotes: _notes, ...rest } = fields;
  return rest;
}

function parseIsoDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

export function parsePartLifecyclePatch(
  body: unknown,
): { partNumber: string; patch: Partial<PartLifecycleFields> } | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Send a part lifecycle update" };
  }
  const record = body as Record<string, unknown>;
  const partNumber =
    typeof record.partNumber === "string" ? normalizePartNumber(record.partNumber) : "";
  if (!partNumber) {
    return { error: "Enter a part number" };
  }
  const patch: Partial<PartLifecycleFields> = {};
  if ("status" in record) {
    const status = record.status;
    if (typeof status !== "string" || !STATUSES.has(status as PartLifecycleStatus)) {
      return { error: "Choose a valid lifecycle status" };
    }
    patch.status = status as PartLifecycleStatus;
  }
  if ("discontinuationDate" in record) {
    const date = parseIsoDate(record.discontinuationDate);
    if (record.discontinuationDate != null && record.discontinuationDate !== "" && !date) {
      return { error: "Discontinuation date must be YYYY-MM-DD" };
    }
    patch.discontinuationDate = date;
  }
  if ("lastTimeBuyDate" in record) {
    const date = parseIsoDate(record.lastTimeBuyDate);
    if (record.lastTimeBuyDate != null && record.lastTimeBuyDate !== "" && !date) {
      return { error: "Last-time-buy date must be YYYY-MM-DD" };
    }
    patch.lastTimeBuyDate = date;
  }
  if ("successorPartNumber" in record) {
    const successor =
      typeof record.successorPartNumber === "string"
        ? normalizePartNumber(record.successorPartNumber)
        : "";
    patch.successorPartNumber = successor || undefined;
  }
  if ("sourceNotes" in record) {
    const notes =
      typeof record.sourceNotes === "string" ? record.sourceNotes.trim() : "";
    patch.sourceNotes = notes || undefined;
  }
  if (Object.keys(patch).length === 0) {
    return { error: "Send at least one field to update" };
  }
  return { partNumber, patch };
}

export function parsePartLifecycleBulk(
  body: unknown,
): { updates: Array<{ partNumber: string; patch: Partial<PartLifecycleFields> }> } | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Send lifecycle updates" };
  }
  const record = body as Record<string, unknown>;
  const raw = record.updates;
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: "Send one or more updates" };
  }
  const updates: Array<{ partNumber: string; patch: Partial<PartLifecycleFields> }> = [];
  for (const row of raw) {
    const parsed = parsePartLifecyclePatch(row);
    if ("error" in parsed) {
      return parsed;
    }
    updates.push(parsed);
  }
  return { updates };
}

type CatalogAccumulator = {
  name: string;
  machineIds: Set<string>;
  machineNames: Set<string>;
};

function collectFromMachine(
  machine: Pick<StoredMachine, "id" | "name" | "parts" | "unmatched">,
  map: Map<string, CatalogAccumulator>,
) {
  for (const part of machine.parts) {
    const partNumber = normalizePartNumber(part.id);
    if (!partNumber) {
      continue;
    }
    const row = map.get(partNumber) ?? {
      name: part.name,
      machineIds: new Set<string>(),
      machineNames: new Set<string>(),
    };
    if (part.name.trim().length > row.name.length) {
      row.name = part.name.trim();
    }
    row.machineIds.add(machine.id);
    row.machineNames.add(machine.name);
    map.set(partNumber, row);
  }
  for (const unmatched of machine.unmatched ?? []) {
    if (unmatched.source !== "list") {
      continue;
    }
    const partNumber = normalizePartNumber(unmatched.id ?? "");
    if (!partNumber) {
      continue;
    }
    const name = (unmatched.name ?? partNumber).trim() || partNumber;
    const row = map.get(partNumber) ?? {
      name,
      machineIds: new Set<string>(),
      machineNames: new Set<string>(),
    };
    if (name.length > row.name.length) {
      row.name = name;
    }
    row.machineIds.add(machine.id);
    row.machineNames.add(machine.name);
    map.set(partNumber, row);
  }
}

export function buildTenantPartCatalog(
  machines: readonly StoredMachine[],
  lifecycleRows: readonly StoredPartLifecycle[],
  tenantId: string,
): TenantPartCatalogRow[] {
  const byPart = new Map<string, CatalogAccumulator>();
  for (const machine of machines) {
    collectFromMachine(machine, byPart);
  }
  const lifecycleByPart = new Map(
    lifecycleRows
      .filter((row) => row.tenantId === tenantId)
      .map((row) => [normalizePartNumber(row.partNumber), row]),
  );
  return [...byPart.entries()]
    .map(([partNumber, acc]) => ({
      partNumber,
      name: acc.name,
      machineIds: [...acc.machineIds],
      machineNames: [...acc.machineNames],
      lifecycle: effectiveLifecycle(lifecycleByPart.get(partNumber)),
    }))
    .sort((a, b) => a.partNumber.localeCompare(b.partNumber));
}

export function lifecycleMapForTenant(
  lifecycleRows: readonly StoredPartLifecycle[],
  tenantId: string,
): Map<string, StoredPartLifecycle> {
  const map = new Map<string, StoredPartLifecycle>();
  for (const row of lifecycleRows) {
    if (row.tenantId !== tenantId) {
      continue;
    }
    map.set(normalizePartNumber(row.partNumber), row);
  }
  return map;
}

export function enrichQuoteItemsWithLifecycle<
  T extends { id: string },
>(
  items: readonly T[],
  map: Map<string, StoredPartLifecycle>,
  role: "staff" | "customer",
): Array<T & { lifecycle?: PublicPartLifecycle | PartLifecycleFields }> {
  return items.map((item) => {
    const record = map.get(normalizePartNumber(item.id));
    const fields = effectiveLifecycle(record);
    if (role === "staff") {
      return { ...item, lifecycle: fields };
    }
    const publicFields = publicLifecycle(fields);
    return publicFields ? { ...item, lifecycle: publicFields } : item;
  });
}

export function enrichPartsWithLifecycle(
  parts: Part[],
  map: Map<string, StoredPartLifecycle>,
  role: "staff" | "customer",
): Part[] {
  return parts.map((part) => {
    const record = map.get(normalizePartNumber(part.id));
    const fields = effectiveLifecycle(record);
    if (role === "staff") {
      return { ...part, lifecycle: fields };
    }
    const publicFields = publicLifecycle(fields);
    return publicFields ? { ...part, lifecycle: publicFields } : part;
  });
}

/** Soft Launch demo rows for hardware fixture parts (seed hosts only). */
const DEMO_LIFECYCLE: Array<
  Omit<StoredPartLifecycle, "id" | "tenantId" | "updatedAt" | "updatedByEmail">
> = [
  {
    partNumber: "6331K32",
    status: "obsolete",
    discontinuationDate: "2025-06-01",
    successorPartNumber: "6331K53",
    sourceNotes: "Demo seed — motor line discontinued.",
  },
  {
    partNumber: "5972K325",
    status: "announced",
    discontinuationDate: "2026-12-31",
    lastTimeBuyDate: "2026-09-30",
    sourceNotes: "Demo seed — bearing NRND for Soft Launch.",
  },
  {
    partNumber: "PN-MTR-3301",
    status: "announced",
    discontinuationDate: "2027-03-31",
    successorPartNumber: "PN-MTR-3301A",
    sourceNotes: "Demo seed — Palletizer gearmotor NRND.",
  },
];

/** Part numbers (hardware fixture) that carry demo lifecycle rows. */
export function demoLifecyclePartNumbers() {
  return DEMO_LIFECYCLE.map((row) => normalizePartNumber(row.partNumber));
}

/** Missing demo rows for `tenantId`; never overwrites a row staff already edited. */
export function missingDemoLifecycleRows(
  existing: StoredPartLifecycle[] | undefined,
  tenantId: string,
  at: string,
  actorEmail: string,
): StoredPartLifecycle[] {
  const have = new Set(
    (existing ?? [])
      .filter((row) => row.tenantId === tenantId)
      .map((row) => normalizePartNumber(row.partNumber)),
  );
  return DEMO_LIFECYCLE.filter((row) => !have.has(normalizePartNumber(row.partNumber))).map(
    (row) => ({
      ...row,
      partNumber: normalizePartNumber(row.partNumber),
      id: partLifecycleRowId(tenantId, row.partNumber),
      tenantId,
      updatedAt: at,
      updatedByEmail: actorEmail,
    }),
  );
}

/**
 * Ensure demo lifecycle rows exist when catalog seeding is on.
 * Future manufacturer obsolescence feeds can merge into `partLifecycle` here.
 */
export function healDemoPartLifecycle<T extends { partLifecycle?: StoredPartLifecycle[] }>(
  db: T,
): T {
  if (!isSeedAllowed() && !isManagedRuntime()) {
    return db;
  }
  const tenantId = DEFAULT_TENANT_ID;
  const existing = new Set(
    (db.partLifecycle ?? [])
      .filter((row) => row.tenantId === tenantId)
      .map((row) => normalizePartNumber(row.partNumber)),
  );
  const now = new Date().toISOString();
  const additions: StoredPartLifecycle[] = [];
  for (const row of DEMO_LIFECYCLE) {
    const partNumber = normalizePartNumber(row.partNumber);
    if (existing.has(partNumber)) {
      continue;
    }
    additions.push({
      ...row,
      id: partLifecycleRowId(tenantId, partNumber),
      tenantId,
      partNumber,
      updatedAt: now,
      updatedByEmail: "seed@spares.local",
    });
  }
  if (additions.length === 0) {
    return db;
  }
  return {
    ...db,
    partLifecycle: [...(db.partLifecycle ?? []), ...additions],
  };
}

export function applyLifecycleUpsert(input: {
  rows: StoredPartLifecycle[];
  tenantId: string;
  partNumber: string;
  patch: Partial<PartLifecycleFields>;
  actorEmail: string;
  at: string;
}): StoredPartLifecycle[] {
  const partNumber = normalizePartNumber(input.partNumber);
  const id = partLifecycleRowId(input.tenantId, partNumber);
  const index = input.rows.findIndex((row) => row.id === id);
  const previous = index >= 0 ? input.rows[index] : undefined;
  const merged: PartLifecycleFields = {
    ...effectiveLifecycle(previous),
    ...input.patch,
  };
  const next: StoredPartLifecycle = {
    id,
    tenantId: input.tenantId,
    partNumber,
    status: merged.status,
    ...(merged.discontinuationDate ? { discontinuationDate: merged.discontinuationDate } : {}),
    ...(merged.lastTimeBuyDate ? { lastTimeBuyDate: merged.lastTimeBuyDate } : {}),
    ...(merged.successorPartNumber ? { successorPartNumber: merged.successorPartNumber } : {}),
    ...(merged.sourceNotes ? { sourceNotes: merged.sourceNotes } : {}),
    updatedAt: input.at,
    updatedByEmail: input.actorEmail,
  };
  if (index >= 0) {
    const copy = input.rows.slice();
    copy[index] = next;
    return copy;
  }
  return [...input.rows, next];
}

export type PartLifecycleStatusCounts = Record<PartLifecycleStatus, number> & {
  all: number;
};

export function tallyPartLifecycleStatusCounts(
  rows: TenantPartCatalogRow[],
): PartLifecycleStatusCounts {
  const counts: PartLifecycleStatusCounts = {
    all: rows.length,
    active: 0,
    announced: 0,
    obsolete: 0,
    unknown: 0,
  };
  for (const row of rows) {
    counts[row.lifecycle.status] += 1;
  }
  return counts;
}

export function filterCatalogRows(
  rows: TenantPartCatalogRow[],
  filters: {
    status?: PartLifecycleStatus | "all";
    machineId?: string;
    query?: string;
  },
): TenantPartCatalogRow[] {
  const status = filters.status ?? "all";
  const machineId = filters.machineId?.trim();
  const needle = filters.query?.trim().toLowerCase();
  return rows.filter((row) => {
    if (status !== "all" && row.lifecycle.status !== status) {
      return false;
    }
    if (machineId && !row.machineIds.includes(machineId)) {
      return false;
    }
    if (needle) {
      const hay = `${row.partNumber} ${row.name} ${row.machineNames.join(" ")}`.toLowerCase();
      if (!hay.includes(needle)) {
        return false;
      }
    }
    return true;
  });
}
