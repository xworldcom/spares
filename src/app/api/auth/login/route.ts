import { NextResponse } from "next/server";
import { hashPassword, setSessionCookie, verifyPassword } from "@/lib/auth";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { toPublicUser } from "@/lib/access";
import { allowLoginAttempt } from "@/lib/rate-limit";
import { findUserByEmail, getOrgContext } from "@/lib/store";

type LoginBody = {
  email?: unknown;
  password?: unknown;
};

function wantsDocument(request: Request) {
  const accept = request.headers.get("accept") ?? "";
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return false;
  }
  return accept.includes("text/html");
}

function redirectNoQuery(path: string) {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: path },
  });
}

async function readLoginBody(request: Request): Promise<LoginBody | NextResponse> {
  const contentType = request.headers.get("content-type") ?? "";
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    try {
      const form = await request.formData();
      return {
        email: form.get("email"),
        password: form.get("password"),
      };
    } catch {
      return error("Invalid form body", 400);
    }
  }
  return readJson<LoginBody>(request);
}

export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/login", request.url), 303);
}

export async function POST(request: Request) {
  const html = wantsDocument(request);
  const body = await readLoginBody(request);
  if (isErrorResponse(body)) {
    return html ? redirectNoQuery("/login") : body;
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return html ? redirectNoQuery("/login") : error("Email and password are required", 400);
  }

  if (!allowLoginAttempt(request, email)) {
    return error("Too many sign-in attempts. Try again in a few minutes.", 429, {
      "Retry-After": "900",
    });
  }

  const user = await findUserByEmail(email);
  if (!user || user.deletedAt || !(await verifyPassword(password, user.passwordHash))) {
    // Keep timing closer on missing users without changing the contract.
    if (!user) {
      await hashPassword(password);
    }
    return html ? redirectNoQuery("/login") : error("Invalid email or password", 401);
  }

  const tenantId = user.tenantId?.trim() || undefined;
  await setSessionCookie(user.id, user.email, tenantId);
  if (html) {
    return redirectNoQuery("/machines");
  }
  if (user.role === "customer") {
    if (!tenantId) {
      return error("Account is missing a host tenant. Contact support.", 403);
    }
    const org = await getOrgContext(tenantId);
    return json({
      user: toPublicUser(user, org.sites, org.customers, { tenantId }),
    });
  }
  return json({ user: toPublicUser(user, [], [], { tenantId }) });
}
