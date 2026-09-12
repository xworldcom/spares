import { joinParts } from "./parts.ts";
import type { Part, PartsListRow, UnmatchedPart } from "@/types";

export type StaffJoinStatus = "joined" | "missing-mesh";

export type StaffCatalogRow = {
  key: string;
  partNumber: string;
  name: string;
  qty: number;
  meshName: string;
  status: StaffJoinStatus;
};

export type StaffPartEdit = {
  key?: string;
  id?: string;
  partNumber: string;
  name: string;
  meshName: string;
  qty: number;
};

export type StaffJoinCounts = {
  joined: number;
  missing: number;
  extra: number;
};

type InternalRow = StaffCatalogRow & { catalog: PartsListRow };

function optionalMeta(row: PartsListRow): Pick<
  PartsListRow,
  "material" | "vendor" | "weight" | "category" | "replaces" | "stock"
> {
  return {
    ...(row.material ? { material: row.material } : {}),
    ...(row.vendor ? { vendor: row.vendor } : {}),
    ...(row.weight ? { weight: row.weight } : {}),
    ...(row.category ? { category: row.category } : {}),
    ...(row.replaces ? { replaces: row.replaces } : {}),
    ...(row.stock ? { stock: row.stock } : {}),
  };
}

function partToCatalog(part: Part): PartsListRow {
  return {
    partNumber: part.id,
    name: part.name,
    meshName: part.meshName,
    qty: part.qty,
    ...(part.material ? { material: part.material } : {}),
    ...(part.vendor ? { vendor: part.vendor } : {}),
    ...(part.weight ? { weight: part.weight } : {}),
    ...(part.category ? { category: part.category } : {}),
    ...(part.replaces ? { replaces: part.replaces } : {}),
    ...(part.stock ? { stock: part.stock } : {}),
  };
}

function parseQty(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 1) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim().replace(/,/g, ""));
    if (Number.isFinite(parsed) && parsed >= 1) {
      return Math.floor(parsed);
    }
  }
  return null;
}

export function staffCatalogRows(
  parts: Part[],
  unmatched: UnmatchedPart[] = [],
): StaffCatalogRow[] {
  return internalRows(parts, unmatched).map(toPublicRow);
}

function toPublicRow(row: InternalRow): StaffCatalogRow {
  return {
    key: row.key,
    partNumber: row.partNumber,
    name: row.name,
    qty: row.qty,
    meshName: row.meshName,
    status: row.status,
  };
}

function internalRows(parts: Part[], unmatched: UnmatchedPart[]): InternalRow[] {
  const rows: InternalRow[] = parts.map((part) => {
    const catalog = partToCatalog(part);
    return {
      key: `part:${part.id}`,
      partNumber: part.id,
      name: part.name,
      qty: part.qty,
      meshName: part.meshName,
      status: "joined",
      catalog,
    };
  });

  for (const row of unmatched) {
    if (row.source !== "list") {
      continue;
    }
    const partNumber = row.id?.trim();
    if (!partNumber) {
      continue;
    }
    const catalog: PartsListRow = {
      partNumber,
      name: (row.name ?? partNumber).trim() || partNumber,
      qty: typeof row.qty === "number" && Number.isFinite(row.qty) && row.qty >= 1
        ? Math.floor(row.qty)
        : 1,
      ...(row.meshName?.trim() ? { meshName: row.meshName.trim() } : {}),
    };
    rows.push({
      key: `list:${partNumber}`,
      partNumber,
      name: catalog.name,
      qty: catalog.qty,
      meshName: catalog.meshName ?? "",
      status: "missing-mesh",
      catalog,
    });
  }

  return rows;
}

export function extraModelMeshes(unmatched: UnmatchedPart[] = []): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const row of unmatched) {
    if (row.source !== "model") {
      continue;
    }
    const meshName = row.meshName?.trim();
    if (!meshName || seen.has(meshName)) {
      continue;
    }
    seen.add(meshName);
    names.push(meshName);
  }
  return names;
}

export function staffJoinCounts(
  parts: Part[],
  unmatched: UnmatchedPart[] = [],
): StaffJoinCounts {
  return {
    joined: parts.length,
    missing: unmatched.filter((row) => row.source === "list").length,
    extra: unmatched.filter((row) => row.source === "model").length,
  };
}

export function knownMeshNames(
  parts: Part[],
  unmatched: UnmatchedPart[] = [],
): string[] {
  const names = new Set<string>();
  for (const part of parts) {
    if (part.meshName?.trim()) {
      names.add(part.meshName.trim());
    }
  }
  for (const meshName of extraModelMeshes(unmatched)) {
    names.add(meshName);
  }
  return [...names];
}

export function parseStaffPartEdit(body: unknown): StaffPartEdit | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Send a part to update" };
  }
  const record = body as Record<string, unknown>;
  const partNumber =
    typeof record.partNumber === "string" ? record.partNumber.trim() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const qty = parseQty(record.qty);
  const meshName =
    typeof record.meshName === "string" ? record.meshName.trim() : "";
  const key = typeof record.key === "string" ? record.key.trim() : "";
  const id = typeof record.id === "string" ? record.id.trim() : "";

  if (!partNumber) {
    return { error: "Enter a part number" };
  }
  if (!name) {
    return { error: "Enter a name" };
  }
  if (qty === null) {
    return { error: "Qty must be 1 or more" };
  }
  if (!key && !id) {
    return { error: "Send the part to edit" };
  }

  return {
    ...(key ? { key } : {}),
    ...(id ? { id } : {}),
    partNumber,
    name,
    meshName,
    qty,
  };
}

function resolveRowIndex(rows: InternalRow[], edit: StaffPartEdit): number {
  if (edit.key) {
    const byKey = rows.findIndex((row) => row.key === edit.key);
    if (byKey >= 0) {
      return byKey;
    }
  }
  const id = edit.id?.trim();
  if (id) {
    const byPart = rows.findIndex((row) => row.key === `part:${id}`);
    if (byPart >= 0) {
      return byPart;
    }
    const byList = rows.findIndex((row) => row.key === `list:${id}`);
    if (byList >= 0) {
      return byList;
    }
  }
  return -1;
}

function reorderJoin(
  order: string[],
  parts: Part[],
  unmatched: UnmatchedPart[],
): { parts: Part[]; unmatched: UnmatchedPart[] } {
  const partsById = new Map(parts.map((part) => [part.id, part]));
  const listById = new Map(
    unmatched
      .filter((row) => row.source === "list" && row.id)
      .map((row) => [row.id as string, row]),
  );
  const orderedParts: Part[] = [];
  const orderedList: UnmatchedPart[] = [];
  for (const partNumber of order) {
    const part = partsById.get(partNumber);
    if (part) {
      orderedParts.push(part);
      partsById.delete(partNumber);
      continue;
    }
    const missing = listById.get(partNumber);
    if (missing) {
      orderedList.push(missing);
      listById.delete(partNumber);
    }
  }
  for (const leftover of partsById.values()) {
    orderedParts.push(leftover);
  }
  for (const leftover of listById.values()) {
    orderedList.push(leftover);
  }
  const extra = unmatched.filter((row) => row.source === "model");
  return { parts: orderedParts, unmatched: [...orderedList, ...extra] };
}

export function applyStaffPartEdit(input: {
  parts: Part[];
  unmatched: UnmatchedPart[];
  meshNames: string[];
  edit: StaffPartEdit;
}): { parts: Part[]; unmatched: UnmatchedPart[] } | { error: string } {
  const rows = internalRows(input.parts, input.unmatched);
  const index = resolveRowIndex(rows, input.edit);
  if (index < 0) {
    return { error: "That part is not on this machine" };
  }

  const duplicate = rows.some(
    (row, rowIndex) =>
      rowIndex !== index && row.partNumber === input.edit.partNumber,
  );
  if (duplicate) {
    return { error: "That part number is already on this list" };
  }

  const current = rows[index];
  if (!current) {
    return { error: "That part is not on this machine" };
  }

  const assignedMesh = input.edit.meshName.trim();
  const nextRows = rows.map((row, rowIndex) => {
    if (rowIndex === index) {
      const catalog: PartsListRow = {
        ...row.catalog,
        partNumber: input.edit.partNumber,
        name: input.edit.name,
        qty: input.edit.qty,
        ...(assignedMesh ? { meshName: assignedMesh } : { meshName: undefined }),
      };
      return {
        key: row.key,
        partNumber: catalog.partNumber,
        name: catalog.name,
        qty: catalog.qty,
        meshName: assignedMesh,
        status: row.status,
        catalog,
      };
    }
    if (assignedMesh && row.catalog.meshName === assignedMesh) {
      const catalog: PartsListRow = { ...row.catalog, meshName: undefined };
      return {
        ...row,
        meshName: "",
        catalog,
      };
    }
    return row;
  });

  const edited = nextRows[index];
  if (!edited) {
    return { error: "That part is not on this machine" };
  }
  const joinRows = [
    edited.catalog,
    ...nextRows.filter((_, rowIndex) => rowIndex !== index).map((row) => row.catalog),
  ].map((row) => ({
    ...row,
    ...optionalMeta(row),
  }));

  const joined = joinParts(joinRows, input.meshNames);
  return reorderJoin(
    nextRows.map((row) => row.partNumber),
    joined.parts,
    joined.unmatched,
  );
}
