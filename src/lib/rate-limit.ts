type Bucket = number[];

const hits = new Map<string, Bucket>();

export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function allowRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
) {
  const recent = (hits.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 4000) {
    for (const [entryKey, stamps] of hits) {
      const kept = stamps.filter((stamp) => now - stamp < windowMs);
      if (kept.length === 0) {
        hits.delete(entryKey);
      } else {
        hits.set(entryKey, kept);
      }
    }
  }
  return true;
}

export function resetRateLimit() {
  hits.clear();
}
