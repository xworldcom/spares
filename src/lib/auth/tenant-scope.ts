import type { PublicUser } from "@/types";
import { error } from "@/lib/http";
import { effectiveStaffTenantId, isPlatformOwnerEmail } from "@/lib/tenant";
import { findUserById } from "@/lib/store";
import type { NextResponse } from "next/server";
import { getCurrentUserReadOnly, requireRole, requireUser } from "./session.ts";

export type TenantScope = {
  tenantId: string;
  user: PublicUser;
};

type AuthError = { error: NextResponse };

async function scopeFromStoredUser(user: PublicUser): Promise<AuthError | TenantScope> {
  if (user.tenantId) {
    return { user, tenantId: user.tenantId };
  }
  const stored = await findUserById(user.id);
  const tenantId = stored ? effectiveStaffTenantId(stored) : null;
  if (!stored || !tenantId) {
    return { error: error("Forbidden", 403) };
  }
  return { user: { ...user, tenantId }, tenantId };
}

export async function requireTenantUser(): Promise<AuthError | TenantScope> {
  const result = await requireUser();
  if ("error" in result) {
    return { error: result.error! };
  }
  return scopeFromStoredUser(result.user);
}

/** List GET handlers: no session cookie refresh on hot paths. */
export async function requireTenantUserReadOnly(): Promise<AuthError | TenantScope> {
  const user = await getCurrentUserReadOnly();
  if (!user) {
    return { error: error("Unauthorized", 401) };
  }
  return scopeFromStoredUser(user);
}

export async function requireTenantStaff(): Promise<AuthError | TenantScope> {
  const auth = await requireRole("staff");
  if ("error" in auth) {
    return { error: auth.error! };
  }
  return scopeFromStoredUser(auth.user);
}

export async function requireTenantCustomer(): Promise<AuthError | TenantScope> {
  const auth = await requireTenantUser();
  if ("error" in auth) {
    return { error: auth.error! };
  }
  if (auth.user.role !== "customer") {
    return { error: error("Forbidden", 403) };
  }
  return auth;
}

export async function requirePlatformOwner() {
  const auth = await requireRole("staff");
  if ("error" in auth) {
    return { error: auth.error! };
  }
  if (!isPlatformOwnerEmail(auth.user.email)) {
    return { error: error("Forbidden", 403) };
  }
  return { user: auth.user };
}
