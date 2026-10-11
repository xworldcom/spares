const DEFAULT_TTL_MS = 45_000;
/** Reuse an in-flight warm promise only briefly; older pending loads are superseded. */
const PENDING_REUSE_MAX_MS = 8_000;

type WarmEntry = {
  expires: number;
  startedAt: number;
  generation: number;
  promise: Promise<unknown>;
};

const warmReads = new Map<string, WarmEntry>();
const warmGenerations = new Map<string, number>();

function nextGeneration(key: string) {
  const next = (warmGenerations.get(key) ?? 0) + 1;
  warmGenerations.set(key, next);
  return next;
}

function entryIsFresh(hit: WarmEntry) {
  return hit.expires > Date.now();
}

function pendingReuseAllowed(hit: WarmEntry) {
  return Date.now() - hit.startedAt <= PENDING_REUSE_MAX_MS;
}

function storeWarmPromise<T>(key: string, generation: number, promise: Promise<T>, ttlMs: number) {
  const tracked = promise
    .then((value) => {
      const hit = warmReads.get(key);
      if (!hit || hit.generation !== generation) {
        return value;
      }
      return value;
    })
    .catch((cause: unknown) => {
      const hit = warmReads.get(key);
      if (hit?.generation === generation) {
        warmReads.delete(key);
      }
      throw cause;
    });
  warmReads.set(key, {
    expires: Date.now() + ttlMs,
    startedAt: Date.now(),
    generation,
    promise: tracked,
  });
  return tracked as Promise<T>;
}

export function warmRead<T>(key: string, load: () => Promise<T>, ttlMs = DEFAULT_TTL_MS) {
  const existing = warmReads.get(key);
  if (existing && entryIsFresh(existing) && pendingReuseAllowed(existing)) {
    return;
  }
  const generation = nextGeneration(key);
  const promise = load();
  storeWarmPromise(key, generation, promise, ttlMs);
}

export async function readIfWarm<T>(
  key: string,
  load: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS,
): Promise<T> {
  const hit = warmReads.get(key);
  if (hit && entryIsFresh(hit) && pendingReuseAllowed(hit)) {
    return hit.promise as Promise<T>;
  }
  if (hit) {
    warmReads.delete(key);
  }
  const generation = nextGeneration(key);
  const promise = load();
  return storeWarmPromise(key, generation, promise, ttlMs);
}

export function invalidateWarmRead(keyOrPrefix: string) {
  for (const key of warmReads.keys()) {
    if (key === keyOrPrefix || key.startsWith(`${keyOrPrefix}:`)) {
      warmReads.delete(key);
    }
  }
}

/** Drop a warm slot so the next read starts a fresh network request. */
export function releaseWarmReadIfPending(key: string) {
  warmReads.delete(key);
}

/** Resolved warm value for ETag 304 replay (same TTL window as readIfWarm). */
export async function peekWarmResolved<T>(key: string): Promise<T | undefined> {
  const hit = warmReads.get(key);
  if (!hit || hit.expires <= Date.now()) {
    return undefined;
  }
  try {
    return (await hit.promise) as T;
  } catch {
    return undefined;
  }
}
