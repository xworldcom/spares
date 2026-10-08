import { hashPassword, passwordPolicyError } from "@/lib/auth";
import { requireTenantStaff } from "@/lib/auth/tenant-scope";
import { error, isErrorResponse, json, readJson, withCatalogConflict } from "@/lib/http";
import { toPublicUser } from "@/lib/access";
import { actorFromUser, recordAccountActivity } from "@/lib/activity-log";
import { createCustomer, getOrgContext, listCustomers } from "@/lib/store";

export async function GET() {
  const auth = await requireTenantStaff();
  if ("error" in auth) {
    return auth.error;
  }
  return json({ customers: await listCustomers(auth.tenantId) });
}

type CreateCustomerBody = {
  email?: unknown;
  password?: unknown;
  name?: unknown;
  siteIds?: unknown;
  machineIds?: unknown;
  companyAccess?: unknown;
};

async function handlePOST(request: Request) {
  const auth = await requireTenantStaff();
  if ("error" in auth) {
    return auth.error;
  }

  const body = await readJson<CreateCustomerBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return error("Email and password are required", 400);
  }
  const policy = passwordPolicyError(password);
  if (policy) {
    return error(policy, 400);
  }

  const siteIds = Array.isArray(body.siteIds)
    ? body.siteIds.filter((value): value is string => typeof value === "string")
    : [];
  const machineIds = Array.isArray(body.machineIds)
    ? body.machineIds.filter((value): value is string => typeof value === "string")
    : [];
  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  const created = await createCustomer(
    auth.tenantId,
    email,
    await hashPassword(password),
    {
      siteIds,
      machineIds,
      ...(name ? { name } : {}),
    },
  );
  if ("error" in created) {
    return error("A user with that email already exists", 409);
  }

  await recordAccountActivity({
    tenantId: auth.tenantId,
    actor: actorFromUser(auth.user),
    action: "person.created",
    summary: `${auth.user.email} created person ${created.user.email}.`,
    target: { type: "person", id: created.user.id, label: created.user.email },
  });

  const org = await getOrgContext(auth.tenantId);
  return json(
    {
      user: toPublicUser(created.user, org.sites, org.customers),
    },
    201,
  );
}

export const POST = withCatalogConflict(handlePOST);
