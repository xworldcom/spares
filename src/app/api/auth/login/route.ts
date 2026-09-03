import { hashPassword, setSessionCookie, verifyPassword } from "@/lib/auth";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { findUserByEmail } from "@/lib/store";

type LoginBody = {
  email?: unknown;
  password?: unknown;
};

export async function POST(request: Request) {
  const body = await readJson<LoginBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return error("Email and password are required", 400);
  }

  const user = await findUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    // Keep timing closer on missing users without changing the contract.
    if (!user) {
      await hashPassword(password);
    }
    return error("Invalid email or password", 401);
  }

  await setSessionCookie(user.id);
  return json({
    user: { id: user.id, email: user.email, role: user.role },
  });
}
