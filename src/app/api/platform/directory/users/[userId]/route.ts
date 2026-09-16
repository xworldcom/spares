import { toPublicUser } from "@/lib/access";
import { requirePlatformOwner } from "@/lib/auth/tenant-scope";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import {
  getOrgContext,
  getPlatformDirectoryUser,
  listMachines,
  mutatePlatformDirectoryUser,
  removePlatformDirectoryUser,
} from "@/lib/store";
import { isPlatformOwnerEmail } from "@/lib/tenant";

export const dynamic = "force-dynamic";

type PatchBody = {
  name?: unknown;
  email?: unknown;
  siteIds?: unknown;
  machineIds?: unknown;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = await requirePlatformOwner();
  if ("error" in auth) {
    return auth.error;
  }

  const { userId } = await params;
  const located = await getPlatformDirectoryUser(userId);
  if ("error" in located) {
    return error("Person not found", 404);
  }

  const { user, tenantId, hostName } = located;
  const org = await getOrgContext(tenantId);
  const machines = await listMachines(tenantId);
  const publicUser = toPublicUser(user, org.sites, org.customers);

  return json({
    user: publicUser,
    role: user.role,
    hostId: tenantId,
    hostName,
    sites: org.sites,
    customers: org.customers,
    machines: machines.map((row) => ({
      id: row.id,
      name: row.name,
      siteId: row.siteId,
    })),
    protectedLogin: user.role === "staff" && isProtectedStaffLogin(user.email),
  });
}

function isProtectedStaffLogin(email: string) {
  const normalized = email.trim().toLowerCase();
  return normalized === "staff@spares.local" || isPlatformOwnerEmail(normalized);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = await requirePlatformOwner();
  if ("error" in auth) {
    return auth.error;
  }

  const { userId } = await params;
  const body = await readJson<PatchBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }

  const name =
    body.name === null
      ? null
      : typeof body.name === "string"
        ? body.name
        : undefined;
  const email = typeof body.email === "string" ? body.email.trim() : undefined;
  const siteIds = Array.isArray(body.siteIds)
    ? body.siteIds.filter((value): value is string => typeof value === "string")
    : undefined;
  const machineIds = Array.isArray(body.machineIds)
    ? body.machineIds.filter((value): value is string => typeof value === "string")
    : undefined;

  if (
    name === undefined &&
    email === undefined &&
    siteIds === undefined &&
    machineIds === undefined
  ) {
    return error("name, email, siteIds, or machineIds is required", 400);
  }

  const updated = await mutatePlatformDirectoryUser(userId, {
    ...(name !== undefined ? { name } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(siteIds !== undefined ? { siteIds } : {}),
    ...(machineIds !== undefined ? { machineIds } : {}),
  });
  if ("error" in updated) {
    if (updated.error === "email-taken") {
      return error("A user with that email already exists", 409);
    }
    if (updated.error === "bad-email") {
      return error("Email is required", 400);
    }
    if (updated.error === "protected") {
      return error("That login is protected and cannot be changed", 400);
    }
    if (updated.error === "invalid") {
      return error("Staff logins cannot have machine access", 400);
    }
    return error("Person not found", 404);
  }

  const located = await getPlatformDirectoryUser(userId);
  if ("error" in located) {
    return error("Person not found", 404);
  }
  const org = await getOrgContext(located.tenantId);
  return json({ user: toPublicUser(updated.user, org.sites, org.customers) });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = await requirePlatformOwner();
  if ("error" in auth) {
    return auth.error;
  }

  const { userId } = await params;
  const removed = await removePlatformDirectoryUser(userId);
  if ("error" in removed) {
    if (removed.error === "protected") {
      return error("That login is protected and cannot be removed", 400);
    }
    return error("Person not found", 404);
  }
  return json({ ok: true });
}
