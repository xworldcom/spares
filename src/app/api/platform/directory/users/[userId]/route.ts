import { toPublicUser } from "@/lib/access";
import { requirePlatformOwner } from "@/lib/auth/tenant-scope";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { actorFromUser, recordAccountActivity } from "@/lib/activity-log";
import {
  getOrgContext,
  getPlatformDirectoryUser,
  listMachines,
  mutatePlatformDirectoryUser,
  removePlatformDirectoryUser,
} from "@/lib/store";
import { isProtectedDemoSeedLogin } from "@/lib/demo-seed-gate";
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
    protectedLogin: isProtectedLogin(user),
  });
}

function isProtectedLogin(user: { role: string; email: string }) {
  const normalized = user.email.trim().toLowerCase();
  if (isProtectedDemoSeedLogin(normalized)) {
    return true;
  }
  return (
    user.role === "staff" &&
    (normalized === "staff@spares.local" || isPlatformOwnerEmail(normalized))
  );
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
  await recordAccountActivity({
    tenantId: located.tenantId,
    actor: actorFromUser(auth.user),
    action: "person.updated",
    summary: `${auth.user.email} updated ${located.user.role} ${updated.user.email}.`,
    target: {
      type: located.user.role === "staff" ? "staff" : "person",
      id: updated.user.id,
      label: updated.user.email,
    },
  });
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
  const located = await getPlatformDirectoryUser(userId);
  const removed = await removePlatformDirectoryUser(userId);
  if ("error" in removed) {
    if (removed.error === "protected") {
      return error("That login is protected and cannot be removed", 400);
    }
    return error("Person not found", 404);
  }

  if (!("error" in located)) {
    await recordAccountActivity({
      tenantId: located.tenantId,
      actor: actorFromUser(auth.user),
      action: "person.deleted",
      summary: `${auth.user.email} removed ${located.user.role} ${located.user.email}.`,
      target: {
        type: located.user.role === "staff" ? "staff" : "person",
        id: userId,
        label: located.user.email,
      },
    });
  }
  return json({ ok: true });
}
