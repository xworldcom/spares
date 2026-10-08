import type { Part } from "./types.ts";

export function normalizePart(part: Part): Part {
  return {
    id: part.id,
    name: part.name,
    meshName: part.meshName,
    qty: typeof part.qty === "number" && Number.isFinite(part.qty) ? part.qty : 1,
    ...(part.material ? { material: part.material } : {}),
    ...(part.vendor ? { vendor: part.vendor } : {}),
    ...(part.weight ? { weight: part.weight } : {}),
    ...(part.category ? { category: part.category } : {}),
    ...(part.replaces ? { replaces: part.replaces } : {}),
    ...(part.stock ? { stock: part.stock } : {}),
    ...(part.lifecycle ? { lifecycle: part.lifecycle } : {}),
  };
}
