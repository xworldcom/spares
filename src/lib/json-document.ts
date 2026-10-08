import { CatalogWriteConflictError } from "./catalog-conflict.ts";
import { getPersistence, type CatalogDocument } from "./persistence.ts";

const ATTEMPTS = 8;

function backoff(attempt: number) {
  const ms = Math.min(250, 8 * 2 ** attempt) * (0.5 + Math.random());
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Read-modify-write one small JSON document with the same compare-and-swap the catalog
 * uses. `mutate` receives the stored text (null when absent) and returns the next text,
 * or null to skip the write. It reruns on a fresh read whenever another writer got in.
 */
export async function updateJsonDocument<T>(
  doc: CatalogDocument,
  mutate: (current: string | null) => { json: string | null; result: T },
): Promise<T> {
  const persistence = getPersistence();
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const { json: current, version } = await persistence.readVersioned(doc);
    const { json, result } = mutate(current);
    if (json === null || json === current) {
      return result;
    }
    const written = await persistence.writeIfVersion(doc, json, version);
    if (written.ok) {
      return result;
    }
    await backoff(attempt);
  }
  throw new CatalogWriteConflictError();
}
