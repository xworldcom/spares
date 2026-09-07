import { hashPassword, passwordIssue, requireRole } from "@/lib/auth";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { toPublicUser } from "@/lib/access";
import { createCustomer, listCustomers, listSites } from "@/lib/store";

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
  const weak = passwordIssue(password);
  if (weak) {
    return error(weak, 400);
  }

  const siteIds = Array.isArray(body.siteIds)
    ? body.siteIds.filter((value): value is string => typeof value === "string")
    : [];
  const companyAccess = Array.isArray(body.companyAccess)
    ? body.companyAccess.filter((value): value is string => typeof value === "string")
    : [];
  const created = await createCustomer(email, await hashPassword(password), {
    siteIds,
    companyAccess,
  });
  if ("error" in created) {
    return error("A user with that email already exists", 409);
  }

  return json(
    {
      user: toPublicUser(created.user, await listSites()),
    },
    201,
  );
}
