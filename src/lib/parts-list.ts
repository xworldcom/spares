import type { PartsListRow } from "@/lib/api/types";

export function partsListToJsonFile(rows: PartsListRow[], filename = "parts.json") {
  const payload = rows.map((row) => ({
    partNumber: row.partNumber,
    name: row.name,
    ...(typeof row.qty === "number" ? { qty: row.qty } : {}),
    ...(row.meshName ? { meshName: row.meshName } : {}),
  }));
  return new File([JSON.stringify(payload, null, 2)], filename, {
    type: "application/json",
  });
}

export function emptyPartsRow(): PartsListRow {
  return { partNumber: "", name: "", qty: 1, meshName: "" };
}
