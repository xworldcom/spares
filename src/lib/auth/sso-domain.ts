import type { Tenant } from "../../types/index.ts";

/** Consumer inboxes that must never enroll as a host SSO domain. */
const BLOCKED_SSO_DOMAINS = new Set([
  "aol.com",
  "gmail.com",
  "gmx.com",
  "gmx.net",
  "googlemail.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "mac.com",
  "mail.com",
  "me.com",
  "msn.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "qq.com",
  "yahoo.com",
  "yandex.com",
  "yandex.ru",
  "ymail.com",
  "zoho.com",
  "163.com",
]);

const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export type NormalizeSsoDomainFailure = {
  ok: false;
  reason: "empty" | "invalid" | "public";
};

export type NormalizeSsoDomainSuccess = {
  ok: true;
  domain: string;
};

export function normalizeSsoDomain(
  raw: string,
): NormalizeSsoDomainSuccess | NormalizeSsoDomainFailure {
  let value = raw.trim().toLowerCase();
  if (!value) {
    return { ok: false, reason: "empty" };
  }
  value = value.replace(/^mailto:/, "");
  value = value.replace(/^https?:\/\//, "");
  value = value.split("/")[0] ?? value;
  value = value.replace(/^@/, "").replace(/\.+$/, "");
  if (!value || /\s/.test(value) || !DOMAIN_RE.test(value)) {
    return { ok: false, reason: "invalid" };
  }
  if (BLOCKED_SSO_DOMAINS.has(value)) {
    return { ok: false, reason: "public" };
  }
  return { ok: true, domain: value };
}

export function emailSsoDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) {
    return null;
  }
  const parsed = normalizeSsoDomain(email.slice(at + 1));
  return parsed.ok ? parsed.domain : null;
}

export type ParseSsoDomainsResult =
  | { ok: true; domains: string[] }
  | { ok: false; message: string; status: number };

function collectSsoDomainTokens(input: unknown): string[] | null {
  if (input === undefined || input === null) {
    return [];
  }
  if (typeof input === "string") {
    return input.split(/[,;\s]+/).filter(Boolean);
  }
  if (Array.isArray(input)) {
    const tokens: string[] = [];
    for (const row of input) {
      if (typeof row !== "string") {
        return null;
      }
      tokens.push(...row.split(/[,;\s]+/).filter(Boolean));
    }
    return tokens;
  }
  return null;
}

export function parseSsoDomains(input: unknown): ParseSsoDomainsResult {
  const tokens = collectSsoDomainTokens(input);
  if (!tokens) {
    return { ok: false, message: "SSO domains must be text", status: 400 };
  }
  const domains: string[] = [];
  for (const token of tokens) {
    const parsed = normalizeSsoDomain(token);
    if (!parsed.ok) {
      if (parsed.reason === "public") {
        return {
          ok: false,
          message: "Public email domains cannot be used for host SSO",
          status: 400,
        };
      }
      return {
        ok: false,
        message: "Enter a company domain such as shape.com",
        status: 400,
      };
    }
    if (!domains.includes(parsed.domain)) {
      domains.push(parsed.domain);
    }
  }
  return { ok: true, domains };
}

export function formatSsoDomains(domains: readonly string[] | undefined) {
  return (domains ?? []).join(", ");
}

export function tenantSsoDomains(tenant: Pick<Tenant, "ssoDomains">) {
  return tenant.ssoDomains ?? [];
}

export function tenantSsoAutorouteEnabled(tenant: Pick<Tenant, "ssoAutoroute">) {
  return tenant.ssoAutoroute === true;
}

export function parseSsoAutoroute(input: unknown): boolean | undefined {
  if (input === undefined || input === null || input === "") {
    return undefined;
  }
  if (input === true || input === 1) {
    return true;
  }
  if (input === false || input === 0) {
    return false;
  }
  if (typeof input === "string") {
    const value = input.trim().toLowerCase();
    if (value === "1" || value === "true" || value === "on" || value === "yes") {
      return true;
    }
    if (value === "0" || value === "false" || value === "off" || value === "no") {
      return false;
    }
  }
  return undefined;
}

export function findActiveTenantForSsoDomain(
  tenants: readonly Tenant[],
  domain: string,
): Tenant | null {
  const matches = tenants.filter(
    (tenant) =>
      !tenant.deletedAt &&
      !tenant.inactiveAt &&
      tenantSsoAutorouteEnabled(tenant) &&
      tenantSsoDomains(tenant).includes(domain),
  );
  return matches.length === 1 ? matches[0] : null;
}

export function ssoDomainOwner(
  tenants: readonly Tenant[],
  domain: string,
  exceptTenantId?: string,
): Tenant | null {
  return (
    tenants.find(
      (tenant) =>
        !tenant.deletedAt &&
        tenant.id !== exceptTenantId &&
        tenantSsoDomains(tenant).includes(domain),
    ) ?? null
  );
}

export function firstTakenSsoDomain(
  tenants: readonly Tenant[],
  domains: readonly string[],
  exceptTenantId?: string,
): string | null {
  for (const domain of domains) {
    if (ssoDomainOwner(tenants, domain, exceptTenantId)) {
      return domain;
    }
  }
  return null;
}
