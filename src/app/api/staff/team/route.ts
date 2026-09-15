import { hashPassword, passwordPolicyError } from "@/lib/auth";
import { requireTenantStaff } from "@/lib/auth/tenant-scope";
import { isDemoSeedLoginBlocked } from "@/lib/demo-seed-gate";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import {
  authorizeStaffTeamPost,
  decideStaffTeamTenant,
} from "@/lib/staff-team-guard";
import { createTenantStaffUser, findUserById, listStaffUsersForTenant } from "@/lib/store";
import { effectiveStaffTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireTenantStaff();
  if ("error" in auth) {
    return auth.error;
  }
  const requestedTenantId = new URL(request.url).searchParams.get("tenantId")?.trim();
  const actor = await findUserById(auth.user.id);
  if (!actor) {
    return error("Unauthorized", 401);
  }
  const actorTenantId = effectiveStaffTenantId(actor) ?? "";
  if (!actorTenantId || actorTenantId !== auth.tenantId) {
    return error("Forbidden", 403);
  }
  const tenantPick = decideStaffTeamTenant({
    actorTenantId,
    actorEmail: actor.email,
    requestedTenantId,
  });
  if (!tenantPick.ok) {
    return error("Forbidden", 403);
  }
  const staff = await listStaffUsersForTenant(tenantPick.tenantId);
  return json({ staff });
}

type CreateBody = {
  email?: unknown;
  password?: unknown;
  tenantId?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireTenantStaff();
  if ("error" in auth) {
    return auth.error;
  }

  const body = await readJson<CreateBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const requestedTenantId =
    typeof body.tenantId === "string" ? body.tenantId.trim() : undefined;

  if (!email || !password) {
    return error("Email and password are required", 400);
  }
  const policy = passwordPolicyError(password);
  if (policy) {
    return error(policy, 400);
  }
  if (isDemoSeedLoginBlocked(email)) {
    return error("That email is reserved for demo fixtures. Use a real work address.", 400);
  }

  const actor = await findUserById(auth.user.id);
  if (!actor) {
    return error("Unauthorized", 401);
  }
  const actorTenantId = effectiveStaffTenantId(actor) ?? "";
  const tenantPick = authorizeStaffTeamPost({
    actorTenantId,
    actorEmail: actor.email,
    sessionTenantId: auth.tenantId,
    requestedTenantId,
  });
  if (!tenantPick.ok) {
    return error("You can only add staff to your own company", 403);
  }

  const created = await createTenantStaffUser(tenantPick.tenantId, {
    email,
    passwordHash: await hashPassword(password),
    role: "staff",
  });
  if ("error" in created) {
    if (created.error === "email-taken") {
      return error("A user with that email already exists", 409);
    }
    if (created.error === "bad-tenant") {
      return error("That company was not found", 404);
    }
    return error("Could not create staff login", 400);
  }

  return json(
    {
      user: {
        id: created.user.id,
        email: created.user.email,
        role: created.user.role,
        tenantId: created.user.tenantId ?? null,
      },
    },
    201,
  );
}
