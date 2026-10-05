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

function rateLimitCount(key: string, windowMs: number, now = Date.now()) {
  return (hits.get(key) ?? []).filter((stamp) => now - stamp < windowMs).length;
}

/** Per-email failed sign-in attempts allowed in the window. */
export const LOGIN_EMAIL_RATE_LIMIT = 25;
/** Loose per-IP cap on failed sign-ins only (abuse backstop, not shared with successes). */
export const LOGIN_IP_FAILURE_RATE_LIMIT = 120;
export const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000;

export function isLoginAttemptAllowed(request: Request, email: string, now = Date.now()) {
  const ip = clientIp(request);
  const normalized = email.trim().toLowerCase() || "missing";
  const emailFailures = rateLimitCount(
    `login:email-fail:${normalized}`,
    LOGIN_RATE_WINDOW_MS,
    now,
  );
  const ipFailures = rateLimitCount(`login:ip-fail:${ip}`, LOGIN_RATE_WINDOW_MS, now);
  return (
    emailFailures < LOGIN_EMAIL_RATE_LIMIT && ipFailures < LOGIN_IP_FAILURE_RATE_LIMIT
  );
}

export function recordFailedLoginAttempt(request: Request, email: string, now = Date.now()) {
  const ip = clientIp(request);
  const normalized = email.trim().toLowerCase() || "missing";
  allowRateLimit(
    `login:email-fail:${normalized}`,
    LOGIN_EMAIL_RATE_LIMIT,
    LOGIN_RATE_WINDOW_MS,
    now,
  );
  allowRateLimit(`login:ip-fail:${ip}`, LOGIN_IP_FAILURE_RATE_LIMIT, LOGIN_RATE_WINDOW_MS, now);
}

export function resetRateLimit() {
  hits.clear();
}
