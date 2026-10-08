import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "spares_session";
export const SESSION_MS = 1000 * 60 * 60 * 24 * 7;

export type SessionPayload = {
  userId: string;
  email?: string;
  tenantId?: string;
  exp: number;
  /** Must match StoredUser.sessionStamp (default 0). */
  stamp?: number;
};

const LOCAL_DEV_SECRET = "spares-not-live-local-secret";

export function sessionSecret() {
  const value = process.env.AUTH_SECRET?.trim();
  if (value && value !== LOCAL_DEV_SECRET) {
    return value;
  }
  if (process.env.VERCEL) {
    throw new Error(
      "AUTH_SECRET must be set to a long random value on Vercel. Do not use the local development default.",
    );
  }
  return LOCAL_DEV_SECRET;
}

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production",
    maxAge,
  };
}

export function signSession(
  userId: string,
  email?: string,
  tenantId?: string,
  stamp = 0,
) {
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      exp: Date.now() + SESSION_MS,
      stamp,
      ...(email ? { email: email.trim().toLowerCase() } : {}),
      ...(tenantId ? { tenantId } : {}),
    } satisfies SessionPayload),
  ).toString("base64url");
  const signature = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function sessionMatchesUserStamp(
  session: { stamp?: number },
  user: { sessionStamp?: number },
) {
  return (session.stamp ?? 0) === (user.sessionStamp ?? 0);
}

export function verifySession(token: string): SessionPayload | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expected = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  const actual = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (actual.length !== expectedBuf.length || !timingSafeEqual(actual, expectedBuf)) {
    return null;
  }

  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (!data.userId || typeof data.exp !== "number" || data.exp < Date.now()) {
      return null;
    }
    if (data.stamp !== undefined && typeof data.stamp !== "number") {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}
