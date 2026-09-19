import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth";
import {
  azureAdConfig,
  decodeMicrosoftOAuthState,
  exchangeMicrosoftCode,
  fetchMicrosoftProfile,
  MICROSOFT_ACCESS_DENIED_CODE,
  MICROSOFT_OAUTH_COOKIE,
  microsoftCallbackRedirectUri,
  oauthStateCookieOptions,
  pickMicrosoftEmail,
  resolveMicrosoftSession,
} from "@/lib/auth/microsoft";
import { actorFromUser, recordAccountActivity } from "@/lib/activity-log";
import { resolveMicrosoftCatalogUser } from "@/lib/store";

function loginErrorRedirect(origin: string, code: string) {
  const target = new URL("/login", origin);
  target.searchParams.set("error", code);
  const response = NextResponse.redirect(target, 303);
  response.cookies.set(MICROSOFT_OAUTH_COOKIE, "", oauthStateCookieOptions(0));
  return response;
}

function successRedirect(origin: string, next: string) {
  const response = NextResponse.redirect(new URL(next, origin), 303);
  response.cookies.set(MICROSOFT_OAUTH_COOKIE, "", oauthStateCookieOptions(0));
  return response;
}

export async function GET(request: Request) {
  const config = azureAdConfig();
  if (!config) {
    return NextResponse.json({ error: "Microsoft sign-in is not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const oauthError = url.searchParams.get("error");
  const originFromState = decodeMicrosoftOAuthState(url.searchParams.get("state") ?? "");
  const fallbackOrigin = originFromState?.origin ?? url.origin;

  if (oauthError) {
    return loginErrorRedirect(fallbackOrigin, MICROSOFT_ACCESS_DENIED_CODE);
  }

  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  if (!code || !stateParam) {
    return loginErrorRedirect(fallbackOrigin, MICROSOFT_ACCESS_DENIED_CODE);
  }

  const cookieState = (await cookies()).get(MICROSOFT_OAUTH_COOKIE)?.value;
  if (!cookieState || cookieState !== stateParam) {
    return loginErrorRedirect(fallbackOrigin, MICROSOFT_ACCESS_DENIED_CODE);
  }

  const state = decodeMicrosoftOAuthState(stateParam);
  if (!state) {
    return loginErrorRedirect(fallbackOrigin, MICROSOFT_ACCESS_DENIED_CODE);
  }

  const redirectUri = microsoftCallbackRedirectUri(state.origin);
  const accessToken = await exchangeMicrosoftCode(config, code, redirectUri);
  if (!accessToken) {
    return loginErrorRedirect(state.origin, MICROSOFT_ACCESS_DENIED_CODE);
  }

  const profile = await fetchMicrosoftProfile(accessToken);
  const email = profile ? pickMicrosoftEmail(profile) : null;
  if (!email) {
    return loginErrorRedirect(state.origin, MICROSOFT_ACCESS_DENIED_CODE);
  }

  const resolved = await resolveMicrosoftCatalogUser(email);
  const session = resolveMicrosoftSession(
    "user" in resolved ? resolved.user ?? null : null,
  );
  if (!session.ok) {
    return loginErrorRedirect(state.origin, MICROSOFT_ACCESS_DENIED_CODE);
  }

  await setSessionCookie(session.userId, session.email, session.tenantId);
  const actor = actorFromUser({
    id: session.userId,
    email: session.email,
    role: "staff",
  });
  if ("user" in resolved && resolved.provisioned) {
    await recordAccountActivity({
      tenantId: session.tenantId,
      actor,
      action: "auth.sso_provision",
      summary: `${session.email} was created as staff by Microsoft SSO autoroute.`,
      target: { type: "staff", id: session.userId, label: session.email },
    });
  }
  await recordAccountActivity({
    tenantId: session.tenantId,
    actor,
    action: "auth.sso_login",
    summary: `${session.email} signed in with Microsoft.`,
  });
  return successRedirect(state.origin, state.next);
}
