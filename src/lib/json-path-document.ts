import { CatalogWriteConflictError } from "./catalog-conflict.ts";
import { getPersistence } from "./persistence.ts";

const ATTEMPTS = 8;

function backoff(attempt: number) {
  const ms = Math.min(250, 8 * 2 ** attempt) * (0.5 + Math.random());
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Read-modify-write one JSON blob at an arbitrary durable path (per-record shards). */
export async function updateJsonPathDocument<T>(
  pathname: string,
  mutate: (current: string | null) => { json: string | null; result: T },
): Promise<T> {
  const persistence = getPersistence();
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const { json: current, version } = await persistence.readVersionedPath(pathname);
    const { json, result } = mutate(current);
    if (json === null || json === current) {
      return result;
    }
    const written = await persistence.writeIfVersionPath(pathname, json, version);
    if (written.ok) {
      return result;
    }
    await backoff(attempt);
  }
  throw new CatalogWriteConflictError();
}
