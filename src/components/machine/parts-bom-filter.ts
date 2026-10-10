import type { Part } from "@/lib/api/types";

export function partMatchesBomFilter(
  part: Part,
  query: string,
  category: string,
): boolean {
  if (category && (part.category ?? "") !== category) {
    return false;
  }
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  const hay = [
    part.name,
    part.id,
    part.meshName,
    part.vendor,
    part.material,
    part.replaces,
    part.category,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}
