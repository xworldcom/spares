import { passwordPolicyError } from "./auth/password.ts";
import { parseSsoAutoroute, parseSsoDomains } from "./auth/sso-domain.ts";

export type CreatePlatformTenantBody = {
  name?: unknown;
  staffEmail?: unknown;
  staffPassword?: unknown;
  ssoDomains?: unknown;
  ssoAutoroute?: unknown;
};

export type ParsedCreatePlatformTenant = {
  name: string;
  staff?: { email: string; password: string };
  ssoDomains?: string[];
  ssoAutoroute?: boolean;
};

type ParseFailure = { ok: false; message: string; status: number };
type ParseSuccess = { ok: true; value: ParsedCreatePlatformTenant };

export function parseCreatePlatformTenantBody(
  body: CreatePlatformTenantBody,
): ParseSuccess | ParseFailure {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return { ok: false, message: "Tenant name is required", status: 400 };
  }

  const staffEmail =
    typeof body.staffEmail === "string" ? body.staffEmail.trim() : "";
  const staffPassword =
    typeof body.staffPassword === "string" ? body.staffPassword : "";

  if (staffEmail && !staffPassword) {
    return {
      ok: false,
      message: "Staff password is required when first staff email is set",
      status: 400,
    };
  }
  if (staffPassword && !staffEmail) {
    return {
      ok: false,
      message: "First staff email is required when setting a password",
      status: 400,
    };
  }
  let ssoDomains: string[] | undefined;
  if (body.ssoDomains !== undefined) {
    const parsedDomains = parseSsoDomains(body.ssoDomains);
    if (!parsedDomains.ok) {
      return {
        ok: false,
        message: parsedDomains.message,
        status: parsedDomains.status,
      };
    }
    ssoDomains = parsedDomains.domains;
  }

  const ssoAutoroute = parseSsoAutoroute(body.ssoAutoroute);
  const sso = {
    ...(ssoDomains ? { ssoDomains } : {}),
    ...(ssoAutoroute !== undefined ? { ssoAutoroute } : {}),
  };

  if (staffEmail && staffPassword) {
    const policy = passwordPolicyError(staffPassword);
    if (policy) {
      return { ok: false, message: policy, status: 400 };
    }
    return {
      ok: true,
      value: {
        name,
        staff: { email: staffEmail, password: staffPassword },
        ...sso,
      },
    };
  }

  return { ok: true, value: { name, ...sso } };
}

export function mapCreateTenantStoreError(
  code: "invalid" | "taken" | "email-taken" | "domain-taken",
): { message: string; status: number } {
  if (code === "taken") {
    return { message: "A tenant with that name already exists", status: 409 };
  }
  if (code === "email-taken") {
    return { message: "Staff email is already in use", status: 409 };
  }
  if (code === "domain-taken") {
    return { message: "That SSO domain is already assigned to another host", status: 409 };
  }
  return { message: "Tenant name is required", status: 400 };
}
