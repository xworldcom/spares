const DEFAULT_TTL_MS = 45_000;

type WarmEntry = {
  expires: number;
  promise: Promise<unknown>;
};

const warmReads = new Map<string, WarmEntry>();

export function warmRead<T>(key: string, load: () => Promise<T>, ttlMs = DEFAULT_TTL_MS) {
  const existing = warmReads.get(key);
  if (existing && existing.expires > Date.now()) {
    return;
  }
  const promise = load().catch((cause: unknown) => {
    warmReads.delete(key);
    throw cause;
  });
  warmReads.set(key, { expires: Date.now() + ttlMs, promise });
}

export async function readIfWarm<T>(
  key: string,
  load: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS,
): Promise<T> {
  const hit = warmReads.get(key);
  if (hit && hit.expires > Date.now()) {
    return hit.promise as Promise<T>;
  }
  const promise = load();
  warmReads.set(key, { expires: Date.now() + ttlMs, promise });
  return promise;
}

export function invalidateWarmRead(keyOrPrefix: string) {
  for (const key of warmReads.keys()) {
    if (key === keyOrPrefix || key.startsWith(`${keyOrPrefix}:`)) {
      warmReads.delete(key);
    }
  }
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
