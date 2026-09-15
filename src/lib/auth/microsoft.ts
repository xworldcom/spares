import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isAllowedModelAssetOrigin } from "../cors.ts";
import { sessionSecret } from "./session-token.ts";

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
const GRAPH_ME_URL =
  "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,otherMails";

export type AzureAdConfig = {
  clientId: string;
  clientSecret: string;
  tenantId: string;
};

export type MicrosoftOAuthState = {
  nonce: string;
  origin: string;
  next: string;
  exp: number;
};

export type MicrosoftLoginLookup = {
  deletedAt?: string | null;
} | null;

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

export function sanitizeNextPath(next: string | null | undefined) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/machines";
  }
  return next;
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

export function createMicrosoftOAuthState(origin: string, next: string) {
  const state: MicrosoftOAuthState = {
    nonce: randomBytes(16).toString("base64url"),
    origin: normalizeAuthOrigin(origin),
    next: sanitizeNextPath(next),
    exp: Date.now() + STATE_MS,
  };
  return encodeMicrosoftOAuthState(state);
}

export function microsoftAuthorizeUrl(config: AzureAdConfig, redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: "openid profile email User.Read offline_access",
    state,
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

export function pickMicrosoftEmail(profile: {
  mail?: string | null;
  userPrincipalName?: string | null;
  otherMails?: string[] | null;
}) {
  const candidates = [
    profile.mail,
    ...(profile.otherMails ?? []),
    profile.userPrincipalName,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.includes("@")) {
      return value.trim().toLowerCase();
    }
  }
  return null;
}

export function resolveMicrosoftLogin(
  user: MicrosoftLoginLookup,
): { ok: true } | { ok: false; message: string } {
  if (!user || user.deletedAt) {
    return { ok: false, message: MICROSOFT_ACCESS_DENIED_MESSAGE };
  }
  return { ok: true };
}

export async function exchangeMicrosoftCode(
  config: AzureAdConfig,
  code: string,
  redirectUri: string,
) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    scope: "openid profile email User.Read offline_access",
  });
  const response = await fetch(microsoftTokenUrl(config), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    return null;
  }
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    return null;
  }
  return data.access_token;
}

export async function fetchMicrosoftProfile(accessToken: string) {
  const response = await fetch(GRAPH_ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as {
    mail?: string | null;
    userPrincipalName?: string | null;
    otherMails?: string[] | null;
  };
}
