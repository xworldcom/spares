/**
 * Three-way rebase for catalog writes.
 *
 * A request reads the catalog (`base`), changes it (`next`), and writes it back. When
 * another instance wrote in between (`latest`), the request's change is re-applied on top
 * of `latest` instead of replacing it: whatever `next` changed relative to `base` wins,
 * everything else keeps the value `latest` already has. That is what makes a mutation a
 * read-modify-write on the freshest blob — a stale snapshot can never overwrite a field
 * it did not itself change (a heal-added grant, a concurrent profile edit, a new row).
 */

type Json = unknown;

const KEYED_COLLECTIONS: Record<string, string> = {
  machineUsage: "machineId",
};

function isPlainObject(value: Json): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function jsonEqual(a: Json, b: Json): boolean {
  if (a === b) {
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => jsonEqual(item, b[index]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (!jsonEqual(a[key], b[key])) {
        return false;
      }
    }
    return true;
  }
  return false;
}

function isPrimitive(value: Json) {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function idOf(row: Json, key: string): string | null {
  if (!isPlainObject(row)) {
    return null;
  }
  const id = row[key];
  return typeof id === "string" ? id : null;
}

function allKeyed(list: Json[], key: string) {
  const seen = new Set<string>();
  for (const row of list) {
    const id = idOf(row, key);
    if (id === null || seen.has(id)) {
      return false;
    }
    seen.add(id);
  }
  return true;
}

function mergePrimitiveLists(base: Json[], next: Json[], latest: Json[]): Json[] {
  const removed = base.filter((item) => !next.includes(item));
  const added = next.filter((item) => !base.includes(item));
  const kept = latest.filter((item) => !removed.includes(item));
  return [...kept, ...added.filter((item) => !kept.includes(item))];
}

function mergeKeyedLists(base: Json[], next: Json[], latest: Json[], key: string): Json[] {
  const baseById = new Map(base.map((row) => [idOf(row, key)!, row]));
  const nextById = new Map(next.map((row) => [idOf(row, key)!, row]));
  const latestById = new Map(latest.map((row) => [idOf(row, key)!, row]));
  const out: Json[] = [];
  for (const row of latest) {
    const id = idOf(row, key)!;
    const had = baseById.has(id);
    const mine = nextById.get(id);
    if (had && mine === undefined) {
      // This writer removed the row; keep it removed unless nobody asked for that.
      continue;
    }
    out.push(mine === undefined ? row : rebase(baseById.get(id), mine, row, key));
  }
  for (const row of next) {
    const id = idOf(row, key)!;
    if (latestById.has(id)) {
      continue;
    }
    if (baseById.has(id)) {
      // Another writer removed a row this writer only edited: the removal stands.
      continue;
    }
    out.push(row);
  }
  return out;
}

function rebase(base: Json, next: Json, latest: Json, key: string): Json {
  if (jsonEqual(next, base)) {
    return latest;
  }
  if (jsonEqual(latest, base)) {
    return next;
  }
  if (isPlainObject(next) && isPlainObject(latest)) {
    const baseObject = isPlainObject(base) ? base : {};
    const out: Record<string, Json> = {};
    const keys = new Set([...Object.keys(latest), ...Object.keys(next)]);
    for (const field of keys) {
      const merged = rebaseField(baseObject[field], next[field], latest[field], field);
      if (merged !== undefined) {
        out[field] = merged;
      }
    }
    return out;
  }
  if (Array.isArray(next) && Array.isArray(latest)) {
    const baseList = Array.isArray(base) ? base : [];
    if (next.every(isPrimitive) && latest.every(isPrimitive) && baseList.every(isPrimitive)) {
      return mergePrimitiveLists(baseList, next, latest);
    }
    if (allKeyed(next, key) && allKeyed(latest, key) && allKeyed(baseList, key)) {
      return mergeKeyedLists(baseList, next, latest, key);
    }
  }
  return next;
}

function rebaseField(base: Json, next: Json, latest: Json, field: string): Json {
  return rebase(base, next, latest, KEYED_COLLECTIONS[field] ?? "id");
}

/**
 * Re-apply the change `base -> next` onto `latest`. Top-level collections are keyed by
 * `id` (care usage by `machineId`); rows both sides touched merge field by field.
 */
export function rebaseCatalog<T extends object>(base: T, next: T, latest: T): T {
  return rebase(base, next, latest, "id") as T;
}
