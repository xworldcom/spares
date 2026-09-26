import { hashPassword } from "@/lib/auth";
import { requirePlatformOwner } from "@/lib/auth/tenant-scope";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import {
  mapCreateTenantStoreError,
  parseCreatePlatformTenantBody,
  type CreatePlatformTenantBody,
} from "@/lib/platform-tenant-create";
import { actorFromUser, recordAccountActivity } from "@/lib/activity-log";
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

export async function POST(request: Request) {
  const auth = await requirePlatformOwner();
  if ("error" in auth) {
    return auth.error;
  }

  const body = await readJson<CreatePlatformTenantBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }

  const parsed = parseCreatePlatformTenantBody(body);
  if (!parsed.ok) {
    return error(parsed.message, parsed.status);
  }

  const created = await createTenantWithOptionalStaff(
    parsed.value.name,
    parsed.value.staff
      ? {
          email: parsed.value.staff.email,
          passwordHash: await hashPassword(parsed.value.staff.password),
        }
      : undefined,
    {
      ssoDomains: parsed.value.ssoDomains,
      ssoTenantIds: parsed.value.ssoTenantIds,
      ssoAutoroute: parsed.value.ssoAutoroute,
    },
  );
  if ("error" in created) {
    const mapped = mapCreateTenantStoreError(created.error);
    return error(mapped.message, mapped.status);
  }

  const staffUser = created.staffUser
    ? {
        id: created.staffUser.id,
        email: created.staffUser.email,
        role: created.staffUser.role,
        tenantId: created.staffUser.tenantId,
      }
    : undefined;

  await recordAccountActivity({
    tenantId: created.tenant.id,
    actor: actorFromUser(auth.user),
    action: "tenant.created",
    summary: `${auth.user.email} created host ${created.tenant.name}.`,
    target: { type: "tenant", id: created.tenant.id, label: created.tenant.name },
    details: {
      ssoDomains: parsed.value.ssoDomains?.join(", ") ?? "",
      ssoTenantIds: parsed.value.ssoTenantIds?.join(", ") ?? "",
      ssoAutoroute: parsed.value.ssoAutoroute ?? false,
      staffEmail: staffUser?.email ?? "",
    },
  });

  return json({ tenant: created.tenant, staffUser }, 201);
}
