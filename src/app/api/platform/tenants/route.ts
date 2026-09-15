import { hashPassword } from "@/lib/auth";
import { requirePlatformOwner } from "@/lib/auth/tenant-scope";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { createTenantWithOptionalStaff, listTenants } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePlatformOwner();
  if ("error" in auth) {
    return auth.error;
  }
  const tenants = await listTenants();
  return json({ tenants });
}

type CreateBody = {
  name?: unknown;
  staffEmail?: unknown;
  staffPassword?: unknown;
};

export async function POST(request: Request) {
  const auth = await requirePlatformOwner();
  if ("error" in auth) {
    return auth.error;
  }

  const body = await readJson<CreateBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return error("Tenant name is required", 400);
  }

  const staffEmail =
    typeof body.staffEmail === "string" ? body.staffEmail.trim() : "";
  const staffPassword =
    typeof body.staffPassword === "string" ? body.staffPassword : "";

  const created = await createTenantWithOptionalStaff(
    name,
    staffEmail && staffPassword
      ? {
          email: staffEmail,
          passwordHash: await hashPassword(staffPassword),
        }
      : undefined,
  );
  if ("error" in created) {
    if (created.error === "taken") {
      return error("A tenant with that name already exists", 409);
    }
    if (created.error === "email-taken") {
      return error("Staff email is already in use", 409);
    }
    return error("Tenant name is required", 400);
  }

  const staffUser = created.staffUser
    ? {
        id: created.staffUser.id,
        email: created.staffUser.email,
        role: created.staffUser.role,
        tenantId: created.staffUser.tenantId,
      }
    : undefined;

  return json({ tenant: created.tenant, staffUser }, 201);
}
