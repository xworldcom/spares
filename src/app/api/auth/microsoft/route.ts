import { NextResponse } from "next/server";
import { requestOrigin } from "@/lib/cors";
import {
  azureAdConfig,
  createMicrosoftOAuthState,
  isAllowedAuthOrigin,
  MICROSOFT_OAUTH_COOKIE,
  microsoftAuthorizeUrl,
  microsoftCallbackRedirectUri,
  oauthStateCookieOptions,
} from "@/lib/auth/microsoft";
import { sanitizeNextPath } from "@/lib/auth/safe-url";

export async function GET(request: Request) {
  const config = azureAdConfig();
  if (!config) {
    return NextResponse.json({ error: "Microsoft sign-in is not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const origin = requestOrigin(request);
  if (!origin || !isAllowedAuthOrigin(origin)) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  }

  const next = sanitizeNextPath(url.searchParams.get("next"));
  const { state, nonce } = createMicrosoftOAuthState(origin, next);
  const redirectUri = microsoftCallbackRedirectUri(origin);
  const authorizeUrl = microsoftAuthorizeUrl(config, redirectUri, state, nonce);

  const response = NextResponse.redirect(authorizeUrl, 302);
  response.cookies.set(
    MICROSOFT_OAUTH_COOKIE,
    state,
    oauthStateCookieOptions(600),
  );
  return response;
}
