import { hashPassword } from "@/lib/auth";
import { requirePlatformOwner } from "@/lib/auth/tenant-scope";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { createTenant, createTenantStaffUser, listTenants } from "@/lib/store";

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

  const created = await createTenant(name);
  if ("error" in created) {
    if (created.error === "taken") {
      return error("A tenant with that name already exists", 409);
    }
    return error("Tenant name is required", 400);
  }

  const staffEmail =
    typeof body.staffEmail === "string" ? body.staffEmail.trim() : "";
  const staffPassword =
    typeof body.staffPassword === "string" ? body.staffPassword : "";

  let staffUser: { id: string; email: string; role: string } | undefined;
  if (staffEmail && staffPassword) {
    const staff = await createTenantStaffUser(created.tenant.id, {
      email: staffEmail,
      passwordHash: await hashPassword(staffPassword),
      role: "staff",
    });
    if ("error" in staff) {
      return error(
        staff.error === "email-taken"
          ? "Staff email is already in use for this tenant"
          : "Could not create staff user",
        staff.error === "email-taken" ? 409 : 400,
      );
    }
    staffUser = {
      id: staff.user.id,
      email: staff.user.email,
      role: staff.user.role,
    };
  }

  return json({ tenant: created.tenant, staffUser }, 201);
}
