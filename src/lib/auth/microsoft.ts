import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isAllowedModelAssetOrigin } from "../cors.ts";
import { effectiveStaffTenantId } from "../tenant.ts";
import { sanitizeNextPath } from "./safe-url.ts";
import { sessionSecret } from "./session-token.ts";
import { isEntraTenantId, MICROSOFT_CONSUMER_TID } from "./sso-domain.ts";

import {
  MICROSOFT_ACCESS_DENIED_CODE,
  MICROSOFT_ACCESS_DENIED_MESSAGE,
} from "./microsoft-public.ts";

export {
  MICROSOFT_ACCESS_DENIED_CODE,
  MICROSOFT_ACCESS_DENIED_MESSAGE,
} from "./microsoft-public.ts";

export const MICROSOFT_OAUTH_COOKIE = "spares_microsoft_oauth";

const STATE_MS = 1000 * 60 * 10;
const OIDC_SCOPE = "openid profile email";

export type AzureAdConfig = {
  clientId: string;
  clientSecret: string;
  tenantId: string;
};

/** Claims the IdP asserted about the signed-in account. Parsed once at the boundary. */
export type MicrosoftIdentity = {
  tid: string;
  oid: string;
  emails: MicrosoftEmailClaim[];
};

/** `verified` = the IdP bound this address to `tid` (UPN suffix is a verified domain of the
 *  tenant, or `xms_edov === true`). An unverified claim is only usable when the host enrolled
 *  that `tid`. */
export type MicrosoftEmailClaim = { email: string; verified: boolean };

type IdTokenPayload = Record<string, unknown>;

/** Trust table. Order is the order `emails` is built in. */
const EMAIL_CLAIM_SOURCES: ReadonlyArray<{
  claim: "preferred_username" | "upn" | "email";
  verified: (payload: IdTokenPayload) => boolean;
}> = [
  { claim: "preferred_username", verified: () => true },
  { claim: "upn", verified: () => true },
  { claim: "email", verified: (p) => p.xms_edov === true || p.xms_edov === "true" },
];

function emailClaimValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const email = value.trim().toLowerCase();
  return email.includes("@") && !email.includes("#ext#") ? email : null;
}

/** Personal accounts prove inbox control, not domain ownership, so nothing they claim is verified. */
function microsoftEmailClaims(payload: IdTokenPayload, tid: string): MicrosoftEmailClaim[] {
  const claims: MicrosoftEmailClaim[] = [];
  for (const source of EMAIL_CLAIM_SOURCES) {
    const email = emailClaimValue(payload[source.claim]);
    if (!email || claims.some((row) => row.email === email)) {
      continue;
    }
    claims.push({
      email,
      verified: tid !== MICROSOFT_CONSUMER_TID && source.verified(payload),
    });
  }
  return claims;
}

function decodeJwtPart(part: string): IdTokenPayload | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as IdTokenPayload)
      : null;
  } catch {
    return null;
  }
}

/**
 * Signature is not verified. The token arrives from the token endpoint over TLS with
 * client-secret auth, so OIDC Core 3.1.3.7 step 6 allows skipping the signature check on
 * that channel.
 */
export function parseMicrosoftIdToken(
  idToken: string,
  expect: { clientId: string; nonce: string; now?: number },
): MicrosoftIdentity | null {
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const header = decodeJwtPart(parts[0]);
  const payload = decodeJwtPart(parts[1]);
  if (!header || !payload || header.alg !== "RS256") {
    return null;
  }
  const tid = typeof payload.tid === "string" ? payload.tid.toLowerCase() : "";
  const oid = typeof payload.oid === "string" ? payload.oid : "";
  const now = expect.now ?? Date.now();
  if (
    !isEntraTenantId(tid) ||
    !oid ||
    payload.aud !== expect.clientId ||
    payload.iss !== `https://login.microsoftonline.com/${tid}/v2.0` ||
    typeof payload.exp !== "number" ||
    payload.exp * 1000 <= now ||
    payload.nonce !== expect.nonce
  ) {
    return null;
  }
  return { tid, oid, emails: microsoftEmailClaims(payload, tid) };
}

export type MicrosoftOAuthState = {
  nonce: string;
  origin: string;
  next: string;
  exp: number;
};

export type MicrosoftLoginLookup = {
  deletedAt?: string | null;
} | null;

export type MicrosoftSessionUser = MicrosoftLoginLookup & {
  id?: string;
  email?: string;
  role?: string;
  tenantId?: string;
  staffCreatedTenantId?: string;
};

export function azureAdConfig(): AzureAdConfig | null {
  const clientId = process.env.AZURE_AD_CLIENT_ID?.trim();
  const clientSecret = process.env.AZURE_AD_CLIENT_SECRET?.trim();
  const tenantRaw = process.env.AZURE_AD_TENANT_ID?.trim();
  const tenantId = tenantRaw && tenantRaw.length > 0 ? tenantRaw : "organizations";
  if (!clientId || !clientSecret) {
    return null;
  }
  return { clientId, clientSecret, tenantId };
}

export function isMicrosoftSignInEnabled() {
  return azureAdConfig() !== null;
}

export function normalizeAuthOrigin(origin: string) {
  return origin.trim().replace(/\/$/, "");
}

/** Same hosts as model CORS plus Spares Vercel preview pattern. */
export function isAllowedAuthOrigin(origin: string | null | undefined) {
  if (!origin) {
    return false;
  }
  const normalized = normalizeAuthOrigin(origin);
  if (!normalized) {
    return false;
  }
  return isAllowedModelAssetOrigin(normalized);
}

function signOAuthPayload(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function encodeMicrosoftOAuthState(state: MicrosoftOAuthState) {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  return `${payload}.${signOAuthPayload(payload)}`;
}

export function decodeMicrosoftOAuthState(token: string): MicrosoftOAuthState | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }
  const expected = signOAuthPayload(payload);
  const actual = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (actual.length !== expectedBuf.length || !timingSafeEqual(actual, expectedBuf)) {
    return null;
  }
  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as MicrosoftOAuthState;
    if (!data.nonce || !data.origin || typeof data.exp !== "number" || data.exp < Date.now()) {
      return null;
    }
    if (!isAllowedAuthOrigin(data.origin)) {
      return null;
    }
    return { ...data, next: sanitizeNextPath(data.next) };
  } catch {
    return null;
  }
}

/** `nonce` doubles as the OIDC nonce so the id_token can be tied to this state. */
export function createMicrosoftOAuthState(
  origin: string,
  next: string,
): { state: string; nonce: string } {
  const state: MicrosoftOAuthState = {
    nonce: randomBytes(16).toString("base64url"),
    origin: normalizeAuthOrigin(origin),
    next: sanitizeNextPath(next),
    exp: Date.now() + STATE_MS,
  };
  return { state: encodeMicrosoftOAuthState(state), nonce: state.nonce };
}

export function microsoftAuthorizeUrl(
  config: AzureAdConfig,
  redirectUri: string,
  state: string,
  nonce: string,
) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: OIDC_SCOPE,
    state,
    nonce,
    prompt: "select_account",
  });
  return `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/authorize?${params}`;
}

export function microsoftTokenUrl(config: AzureAdConfig) {
  return `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`;
}

export function microsoftCallbackRedirectUri(origin: string) {
  return `${normalizeAuthOrigin(origin)}/api/auth/microsoft/callback`;
}

export function oauthStateCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/api/auth/microsoft",
    secure: Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production",
    maxAge: maxAgeSeconds,
  };
}

export function resolveMicrosoftLogin(
  user: MicrosoftLoginLookup,
): { ok: true } | { ok: false; message: string } {
  if (!user || user.deletedAt) {
    return { ok: false, message: MICROSOFT_ACCESS_DENIED_MESSAGE };
  }
  return { ok: true };
}

/** Map the matched catalog user → Spares session scope (same tenant rules as POST /api/auth/login). */
export function resolveMicrosoftSession(
  user: MicrosoftSessionUser | null,
):
  | { ok: true; userId: string; email: string; tenantId: string }
  | { ok: false; message: string } {
  const decision = resolveMicrosoftLogin(user);
  if (!decision.ok) {
    return decision;
  }
  if (!user?.id || !user.email) {
    return { ok: false, message: MICROSOFT_ACCESS_DENIED_MESSAGE };
  }
  const tenantId = effectiveStaffTenantId(user);
  if (!tenantId) {
    return { ok: false, message: MICROSOFT_ACCESS_DENIED_MESSAGE };
  }
  return {
    ok: true,
    userId: user.id,
    email: user.email.trim().toLowerCase(),
    tenantId,
  };
}

export async function exchangeMicrosoftCode(
  config: AzureAdConfig,
  code: string,
  redirectUri: string,
): Promise<{ idToken: string } | null> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    scope: OIDC_SCOPE,
  });
  const response = await fetch(microsoftTokenUrl(config), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    return null;
  }
  const data = (await response.json()) as { id_token?: string };
  if (typeof data.id_token !== "string" || !data.id_token) {
    return null;
  }
  return { idToken: data.id_token };
}
