import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth";
import {
  azureAdConfig,
  decodeMicrosoftOAuthState,
  exchangeMicrosoftCode,
  MICROSOFT_ACCESS_DENIED_CODE,
  MICROSOFT_OAUTH_COOKIE,
  microsoftCallbackRedirectUri,
  oauthStateCookieOptions,
  parseMicrosoftIdToken,
  resolveMicrosoftSession,
} from "@/lib/auth/microsoft";
import { actorFromUser, recordAccountActivity } from "@/lib/activity-log";
import { resolveMicrosoftCatalogUser } from "@/lib/store";

/** `tid` lets the person hand their Entra tenant id to the host admin who enrolls it. */
function loginErrorRedirect(origin: string, code: string, tid?: string) {
  const target = new URL("/login", origin);
  target.searchParams.set("error", code);
  if (tid) {
    target.searchParams.set("tid", tid);
  }
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
  const exchanged = await exchangeMicrosoftCode(config, code, redirectUri);
  if (!exchanged) {
    return loginErrorRedirect(state.origin, MICROSOFT_ACCESS_DENIED_CODE);
  }

  const identity = parseMicrosoftIdToken(exchanged.idToken, {
    clientId: config.clientId,
    nonce: state.nonce,
  });
  if (!identity) {
    return loginErrorRedirect(state.origin, MICROSOFT_ACCESS_DENIED_CODE);
  }

  const resolved = await resolveMicrosoftCatalogUser(identity);
  const session = resolveMicrosoftSession("user" in resolved ? resolved.user : null);
  if (!session.ok) {
    return loginErrorRedirect(state.origin, MICROSOFT_ACCESS_DENIED_CODE, identity.tid);
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
