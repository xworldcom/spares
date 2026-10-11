import { cache } from "react";
import { getPersistence, type CatalogVersionPeek } from "./persistence.ts";

/** One Blob HEAD pair (or disk read) per request — shared by auth, list cache, and store memory gate. */
export const peekCatalogVersionsCoalesced = cache(
  (): Promise<CatalogVersionPeek> => getPersistence().peekCatalogVersions(),
);

export function formatCatalogVersionKey(peek: CatalogVersionPeek) {
  return `${peek.database ?? "∅"}:${peek.care ?? "∅"}`;
}
