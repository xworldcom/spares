import { hashPassword, passwordPolicyError } from "@/lib/auth";
import { requireTenantStaff } from "@/lib/auth/tenant-scope";
import { isDemoSeedLoginBlocked } from "@/lib/demo-seed-gate";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { resolveStaffCreateTenantId } from "@/lib/staff-create-scope";
import { isPlatformOwnerEmail } from "@/lib/tenant";
import { createTenantStaffUser, listStaffUsersForTenant } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireTenantStaff();
  if ("error" in auth) {
    return auth.error;
  }
  const requestedTenantId = new URL(request.url).searchParams.get("tenantId")?.trim();
  const platformOwner = isPlatformOwnerEmail(auth.user.email);
  const tenantPick = resolveStaffCreateTenantId({
    sessionTenantId: auth.tenantId,
    requestedTenantId,
    platformOwner,
  });
  if ("error" in tenantPick) {
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

  const platformOwner = isPlatformOwnerEmail(auth.user.email);
  const tenantPick = resolveStaffCreateTenantId({
    sessionTenantId: auth.tenantId,
    requestedTenantId,
    platformOwner,
  });
  if ("error" in tenantPick) {
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
