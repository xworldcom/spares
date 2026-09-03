import type { PartsListRow } from "@/lib/api/types";

export function partsListToJsonFile(rows: PartsListRow[], filename = "parts.json") {
  const payload = rows.map((row) => ({
    partNumber: row.partNumber,
    name: row.name,
    qty: typeof row.qty === "number" && Number.isFinite(row.qty) ? row.qty : 1,
    ...(row.meshName ? { meshName: row.meshName } : {}),
  }));
  return new File([JSON.stringify(payload, null, 2)], filename, {
    type: "application/json",
  });
}

export function emptyPartsRow(): PartsListRow {
  return { partNumber: "", name: "", qty: 1, meshName: "" };
}
