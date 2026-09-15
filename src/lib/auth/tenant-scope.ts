import type { PublicUser } from "@/types";
import { error } from "@/lib/http";
import { isPlatformOwnerEmail } from "@/lib/tenant";
import type { NextResponse } from "next/server";
import { requireRole, requireUser } from "./session.ts";

export type TenantScope = {
  tenantId: string;
  user: PublicUser;
};

type AuthError = { error: NextResponse };

export async function requireTenantUser(): Promise<AuthError | TenantScope> {
  const result = await requireUser();
  if ("error" in result) {
    return { error: result.error! };
  }
  const tenantId = result.user.tenantId;
  if (!tenantId) {
    return { error: error("Forbidden", 403) };
  }
  return { user: result.user, tenantId };
}

export async function requireTenantStaff(): Promise<AuthError | TenantScope> {
  const auth = await requireRole("staff");
  if ("error" in auth) {
    return { error: auth.error! };
  }
  const tenantId = auth.user.tenantId;
  if (!tenantId) {
    return { error: error("Forbidden", 403) };
  }
  return { user: auth.user, tenantId };
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
