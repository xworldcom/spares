import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { PublicUser, Role } from "@/types";
import { error } from "@/lib/http";
import { findUserByEmail, findUserById } from "@/lib/store";

export const SESSION_COOKIE = "spares_session";
const SESSION_MS = 1000 * 60 * 60 * 24 * 7;

type SessionPayload = {
  userId: string;
  email?: string;
  exp: number;
};

function secret() {
  return process.env.AUTH_SECRET ?? "spares-not-live-local-secret";
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge,
  };
}

export function signSession(userId: string, email?: string) {
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      exp: Date.now() + SESSION_MS,
      ...(email ? { email: email.trim().toLowerCase() } : {}),
    } satisfies SessionPayload),
  ).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySession(token: string): SessionPayload | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
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
    return data;
  } catch {
    return null;
  }
}

export async function setSessionCookie(userId: string, email?: string) {
  const store = await cookies();
  store.set(
    SESSION_COOKIE,
    signSession(userId, email),
    cookieOptions(SESSION_MS / 1000),
  );
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", cookieOptions(0));
}

export async function getCurrentUser(): Promise<PublicUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const session = verifySession(token);
  if (!session) {
    return null;
  }

  const user =
    (await findUserById(session.userId)) ??
    (session.email ? await findUserByEmail(session.email) : null);
  if (!user) {
    return null;
  }

  return { id: user.id, email: user.email, role: user.role };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    return { error: error("Unauthorized", 401) };
  }
  return { user };
}

export async function requireRole(role: Role) {
  const result = await requireUser();
  if ("error" in result) {
    return result;
  }
  if (result.user.role !== role) {
    return { error: error("Forbidden", 403) };
  }
  return result;
}
