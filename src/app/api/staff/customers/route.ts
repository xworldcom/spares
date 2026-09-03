import { hashPassword, requireRole } from "@/lib/auth";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { createCustomer } from "@/lib/store";

type CreateCustomerBody = {
  email?: unknown;
  password?: unknown;
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

  const created = await createCustomer(email, await hashPassword(password));
  if ("error" in created) {
    return error("A user with that email already exists", 409);
  }

  return json(
    {
      user: {
        id: created.user.id,
        email: created.user.email,
        role: created.user.role,
      },
    },
    201,
  );
}
