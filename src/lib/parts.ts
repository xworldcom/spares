import type { Part, PartsListRow, UnmatchedPart } from "@/types";

function parseCsv(text: string): string[][] {
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
    } else if (char === ",") {
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

function asRow(value: unknown): PartsListRow | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const partNumber = typeof record.partNumber === "string" ? record.partNumber.trim() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const meshName =
    typeof record.meshName === "string" && record.meshName.trim()
      ? record.meshName.trim()
      : undefined;
  if (!partNumber || !name) {
    return null;
  }
  return { partNumber, name, meshName };
}

export function parsePartsList(text: string, filename: string): PartsListRow[] {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) {
    throw new Error("Parts list is empty");
  }

  const lower = filename.toLowerCase();
  const looksJson = lower.endsWith(".json") || trimmed.startsWith("[");
  if (looksJson) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("Parts list JSON must be an array");
    }
    const rows = parsed.map(asRow).filter((row): row is PartsListRow => row !== null);
    if (rows.length === 0) {
      throw new Error("Parts list has no valid rows");
    }
    return rows;
  }

  const table = parseCsv(trimmed);
  const header = table[0]?.map((cell) => cell.trim());
  if (!header) {
    throw new Error("Parts list CSV is missing a header row");
  }

  const index = {
    partNumber: header.findIndex((cell) => cell.toLowerCase() === "partnumber"),
    name: header.findIndex((cell) => cell.toLowerCase() === "name"),
    meshName: header.findIndex((cell) => cell.toLowerCase() === "meshname"),
  };
  if (index.partNumber < 0 || index.name < 0) {
    throw new Error("Parts list CSV must include partNumber and name headers");
  }

  const rows: PartsListRow[] = [];
  for (const cells of table.slice(1)) {
    const row = asRow({
      partNumber: cells[index.partNumber] ?? "",
      name: cells[index.name] ?? "",
      meshName: index.meshName >= 0 ? (cells[index.meshName] ?? "") : "",
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
  const available = new Set(meshNames);
  const used = new Set<string>();
  const parts: Part[] = [];
  const unmatched: UnmatchedPart[] = [];

  for (const row of listRows) {
    const candidates = [row.meshName, row.partNumber, row.name].filter(
      (value): value is string => Boolean(value),
    );
    const meshName = candidates.find((name) => available.has(name) && !used.has(name));

    if (meshName) {
      parts.push({ id: row.partNumber, name: row.name, meshName });
      used.add(meshName);
    } else {
      unmatched.push({
        source: "list",
        id: row.partNumber,
        name: row.name,
        ...(row.meshName ? { meshName: row.meshName } : {}),
      });
    }
  }

  for (const meshName of meshNames) {
    if (!used.has(meshName)) {
      unmatched.push({ source: "model", meshName });
    }
  }

  return { parts, unmatched };
}
