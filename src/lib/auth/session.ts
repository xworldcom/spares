import { cookies } from "next/headers";
import type { PublicUser, Role } from "@/types";
import { error } from "@/lib/http";
import { toPublicUser } from "@/lib/access";
import { effectiveStaffTenantId, isPlatformOwnerEmail } from "@/lib/tenant";
import { findUserByEmail, findUserById, getOrgContext } from "@/lib/store";
import {
  SESSION_COOKIE,
  SESSION_MS,
  sessionCookieOptions,
  sessionMatchesUserStamp,
  signSession,
  verifySession,
} from "@/lib/auth/session-token";

export { SESSION_COOKIE, signSession, verifySession } from "@/lib/auth/session-token";

export async function setSessionCookie(
  userId: string,
  email?: string,
  tenantId?: string,
  sessionStamp = 0,
) {
  const store = await cookies();
  store.set(
    SESSION_COOKIE,
    signSession(userId, email, tenantId, sessionStamp),
    sessionCookieOptions(SESSION_MS / 1000),
  );
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", sessionCookieOptions(0));
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
  if (!user || user.deletedAt) {
    return null;
  }
  if (!sessionMatchesUserStamp(session, user)) {
    return null;
  }

  const tenantId = effectiveStaffTenantId(user) ?? undefined;
  const stamp = user.sessionStamp ?? 0;
  if (
    !session.email ||
    session.email !== user.email ||
    session.userId !== user.id ||
    session.tenantId !== tenantId
  ) {
    await setSessionCookie(user.id, user.email, tenantId, stamp);
  }

  const platformOwner = isPlatformOwnerEmail(user.email);
  if (user.role === "customer") {
    if (!tenantId) {
      return toPublicUser(user, [], [], { platformOwner });
    }
    const { sites, customers } = await getOrgContext(tenantId);
    return toPublicUser(user, sites, customers, { platformOwner, tenantId });
  }
  return toPublicUser(user, [], [], { platformOwner, tenantId });
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
