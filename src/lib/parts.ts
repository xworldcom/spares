import { cadKeys } from "./cad-name.ts";
import type { Part, PartsListRow, UnmatchedPart } from "@/types";

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") {
        i += 1;
      }
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

function detectDelimiter(headerLine: string) {
  const commas = (headerLine.match(/,/g) ?? []).length;
  const tabs = (headerLine.match(/\t/g) ?? []).length;
  const semis = (headerLine.match(/;/g) ?? []).length;
  if (tabs > commas && tabs >= semis) {
    return "\t";
  }
  if (semis > commas && semis >= tabs) {
    return ";";
  }
  return ",";
}

function parseQty(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 1) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim().replace(/,/g, ""));
    if (Number.isFinite(parsed) && parsed >= 1) {
      return Math.floor(parsed);
    }
  }
  return 1;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s_\-/]+/g, "");
}

const PART_NUMBER_HEADERS = new Set([
  "partnumber",
  "partno",
  "part#",
  "pn",
  "itemnumber",
  "itemno",
  "item",
  "number",
  "material",
  "sku",
  "id",
]);

const NAME_HEADERS = new Set([
  "name",
  "description",
  "desc",
  "title",
  "partname",
  "itemname",
  "component",
]);

const MESH_HEADERS = new Set([
  "meshname",
  "mesh",
  "node",
  "object",
  "objectname",
  "cadname",
  "filename",
]);

const QTY_HEADERS = new Set(["qty", "quantity", "qty.", "count", "q", "bomqty"]);

function firstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return "";
}

function asRow(value: unknown): PartsListRow | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const [key, cell] of Object.entries(record)) {
    normalized[normalizeHeader(key)] = cell;
  }

  const partNumber =
    firstString(normalized, [...PART_NUMBER_HEADERS]) ||
    (typeof record.partNumber === "string" ? record.partNumber.trim() : "");
  const name =
    firstString(normalized, [...NAME_HEADERS]) ||
    (typeof record.name === "string" ? record.name.trim() : "");
  const meshName =
    firstString(normalized, [...MESH_HEADERS]) || undefined;

  if (!partNumber || !name) {
    return null;
  }
  const qtySource =
    normalized.qty ??
    normalized.quantity ??
    normalized.count ??
    normalized.bomqty ??
    record.qty;
  return { partNumber, name, meshName, qty: parseQty(qtySource) };
}

function rowsFromUnknown(parsed: unknown): PartsListRow[] {
  if (Array.isArray(parsed)) {
    return parsed.map(asRow).filter((row): row is PartsListRow => row !== null);
  }
  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    for (const key of ["parts", "items", "rows", "bom"]) {
      if (Array.isArray(record[key])) {
        return rowsFromUnknown(record[key]);
      }
    }
  }
  return [];
}

export function parsePartsList(text: string, filename: string): PartsListRow[] {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) {
    throw new Error("Parts list is empty");
  }

  const lower = filename.toLowerCase();
  const looksJson =
    lower.endsWith(".json") || trimmed.startsWith("[") || trimmed.startsWith("{");
  if (looksJson) {
    const parsed = JSON.parse(trimmed) as unknown;
    const rows = rowsFromUnknown(parsed);
    if (rows.length === 0) {
      throw new Error("Parts list has no valid rows");
    }
    return rows;
  }

  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = lower.endsWith(".tsv") ? "\t" : detectDelimiter(firstLine);
  const table = parseDelimited(trimmed, delimiter);
  const header = table[0]?.map((cell) => cell.trim());
  if (!header) {
    throw new Error("Parts list is missing a header row");
  }

  const index = {
    partNumber: header.findIndex((cell) =>
      PART_NUMBER_HEADERS.has(normalizeHeader(cell)),
    ),
    name: header.findIndex((cell) => NAME_HEADERS.has(normalizeHeader(cell))),
    meshName: header.findIndex((cell) => MESH_HEADERS.has(normalizeHeader(cell))),
    qty: header.findIndex((cell) => QTY_HEADERS.has(normalizeHeader(cell))),
  };
  if (index.partNumber < 0 || index.name < 0) {
    throw new Error(
      "Parts list needs a part number column and a name/description column",
    );
  }

  const rows: PartsListRow[] = [];
  for (const cells of table.slice(1)) {
    const row = asRow({
      partNumber: cells[index.partNumber] ?? "",
      name: cells[index.name] ?? "",
      meshName: index.meshName >= 0 ? (cells[index.meshName] ?? "") : "",
      qty: index.qty >= 0 ? (cells[index.qty] ?? "") : "",
    });
    if (row) {
      rows.push(row);
    }
  }

  if (rows.length === 0) {
    throw new Error("Parts list has no valid rows");
  }

  return rows;
}

export function joinParts(
  listRows: PartsListRow[],
  meshNames: string[],
): { parts: Part[]; unmatched: UnmatchedPart[] } {
  const unused = new Set(meshNames);
  const parts: Part[] = [];
  const unmatched: UnmatchedPart[] = [];

  function takeMeshes(row: PartsListRow): string | null {
    const rowKeys = new Set(
      [row.meshName, row.partNumber, row.name].flatMap((value) => cadKeys(value)),
    );
    if (rowKeys.size === 0) {
      return null;
    }
    const hits = meshNames.filter((meshName) => {
      if (!unused.has(meshName)) {
        return false;
      }
      return cadKeys(meshName).some((key) => rowKeys.has(key));
    });
    if (hits.length === 0) {
      return null;
    }
    for (const hit of hits) {
      unused.delete(hit);
    }
    return hits[0] ?? null;
  }

  for (const row of listRows) {
    const meshName = takeMeshes(row);
    if (meshName) {
      parts.push({ id: row.partNumber, name: row.name, meshName, qty: row.qty });
    } else {
      unmatched.push({
        source: "list",
        id: row.partNumber,
        name: row.name,
        qty: row.qty,
        ...(row.meshName ? { meshName: row.meshName } : {}),
      });
    }
  }

  for (const meshName of meshNames) {
    if (unused.has(meshName)) {
      unmatched.push({ source: "model", meshName });
    }
  }

  return { parts, unmatched };
}
