import { hashPassword, passwordPolicyError, requireRole } from "@/lib/auth";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { toPublicUser } from "@/lib/access";
import { createCustomer, getOrgContext, listCustomers } from "@/lib/store";

export async function GET() {
  const auth = await requireRole("staff");
  if ("error" in auth) {
    return auth.error;
  }
  return json({ customers: await listCustomers() });
}

type CreateCustomerBody = {
  email?: unknown;
  password?: unknown;
  siteIds?: unknown;
  machineIds?: unknown;
  companyAccess?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireRole("staff");
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
  const created = await createCustomer(email, await hashPassword(password), {
    siteIds,
    machineIds,
  });
  if ("error" in created) {
    return error("A user with that email already exists", 409);
  }

  const org = await getOrgContext();
  return json(
    {
      user: toPublicUser(created.user, org.sites, org.customers),
    },
    201,
  );
}
