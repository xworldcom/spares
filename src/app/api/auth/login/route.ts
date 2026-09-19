import { NextResponse } from "next/server";
import { hashPassword, setSessionCookie, verifyPassword } from "@/lib/auth";
import { assertPasswordLoginAllowed } from "@/lib/auth/password-login.server";
import { isSameOriginRequest } from "@/lib/cors";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { toPublicUser } from "@/lib/access";
import { isDemoSeedLoginBlocked } from "@/lib/demo-seed-gate";
import { allowLoginAttempt } from "@/lib/rate-limit";
import { effectiveStaffTenantId, isPlatformOwnerEmail } from "@/lib/tenant";
import { actorFromUser, recordAccountActivity } from "@/lib/activity-log";
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
  if (!isSameOriginRequest(request)) {
    return html ? redirectNoQuery("/login") : error("Origin not allowed", 403);
  }
  const body = await readLoginBody(request);
  if (isErrorResponse(body)) {
    return html ? redirectNoQuery("/login") : body;
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return html ? redirectNoQuery("/login") : error("Email and password are required", 400);
  }

  const passwordGate = await assertPasswordLoginAllowed();
  if (!passwordGate.ok) {
    return html
      ? redirectNoQuery("/login?error=password_login_disabled")
      : error(passwordGate.message, passwordGate.status);
  }

  if (!allowLoginAttempt(request, email)) {
    return error("Too many sign-in attempts. Try again in a few minutes.", 429, {
      "Retry-After": "900",
    });
  }

  if (isDemoSeedLoginBlocked(email)) {
    return html ? redirectNoQuery("/login") : error("Invalid email or password", 401);
  }

  const user = await findUserByEmail(email);
  if (!user || user.deletedAt || !(await verifyPassword(password, user.passwordHash))) {
    // Keep timing closer on missing users without changing the contract.
    if (!user) {
      await hashPassword(password);
    }
    return html ? redirectNoQuery("/login") : error("Invalid email or password", 401);
  }

  const tenantId = effectiveStaffTenantId(user) ?? undefined;
  if (!tenantId) {
    return html
      ? redirectNoQuery("/login")
      : error("Account is missing a host tenant. Contact support.", 403);
  }
  await setSessionCookie(user.id, user.email, tenantId);
  await recordAccountActivity({
    tenantId,
    actor: actorFromUser(user),
    action: "auth.login",
    summary: `${user.email} signed in with email and password.`,
  });
  if (html) {
    return redirectNoQuery("/machines");
  }
  // Same shape as /api/auth/me — the client gates platform nav on this flag.
  const platformOwner = isPlatformOwnerEmail(user.email);
  if (user.role === "customer") {
    const org = await getOrgContext(tenantId);
    return json({
      user: toPublicUser(user, org.sites, org.customers, { tenantId, platformOwner }),
    });
  }
  return json({ user: toPublicUser(user, [], [], { tenantId, platformOwner }) });
}
