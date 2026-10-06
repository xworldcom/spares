import { passwordPolicyError } from "./auth/password.ts";
import {
  parseSsoAutoroute,
  parseSsoDomains,
  parseSsoTenantIds,
} from "./auth/sso-domain.ts";

export type CreatePlatformTenantBody = {
  name?: unknown;
  staffEmail?: unknown;
  staffPassword?: unknown;
  ssoDomains?: unknown;
  ssoTenantIds?: unknown;
  ssoAutoroute?: unknown;
};

export type ParsedCreatePlatformTenant = {
  name: string;
  staff?: { email: string; password: string };
  ssoDomains?: string[];
  ssoTenantIds?: string[];
  ssoAutoroute?: boolean;
};

export const AUTOROUTE_NEEDS_ENROLLMENT_MESSAGE =
  "Turn on autoroute after enrolling at least one work domain and one Entra tenant ID";

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
  let ssoTenantIds: string[] | undefined;
  if (body.ssoTenantIds !== undefined) {
    const parsedTenantIds = parseSsoTenantIds(body.ssoTenantIds);
    if (!parsedTenantIds.ok) {
      return {
        ok: false,
        message: parsedTenantIds.message,
        status: parsedTenantIds.status,
      };
    }
    ssoTenantIds = parsedTenantIds.tenantIds;
  }

  const ssoAutoroute = parseSsoAutoroute(body.ssoAutoroute);
  const sso = {
    ...(ssoDomains ? { ssoDomains } : {}),
    ...(ssoTenantIds ? { ssoTenantIds } : {}),
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
  code:
    | "invalid"
    | "taken"
    | "email-taken"
    | "domain-taken"
    | "local-part-taken"
    | "autoroute-needs-enrollment",
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
  if (code === "local-part-taken") {
    return { message: "That inbound address is already assigned to another host", status: 409 };
  }
  if (code === "autoroute-needs-enrollment") {
    return { message: AUTOROUTE_NEEDS_ENROLLMENT_MESSAGE, status: 400 };
  }
  return { message: "Tenant name is required", status: 400 };
}
