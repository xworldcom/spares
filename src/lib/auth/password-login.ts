import { isMicrosoftSignInEnabled } from "./microsoft.ts";
import { getPlatformSignInSettingsFromCatalog } from "../store.ts";

export const PASSWORD_LOGIN_DISABLED_MESSAGE =
  "Email and password sign-in is turned off. Sign in with Microsoft or contact your admin.";

export const PASSWORD_LOGIN_DISABLED_CODE = "password_login_disabled";

export const PASSWORD_LOGIN_UNAVAILABLE_MESSAGE =
  "Sign-in is unavailable right now. Contact your platform admin to enable Microsoft SSO or password sign-in.";

export type PasswordLoginEnvOverride = "force-off" | "force-on" | null;

/** Hard kill-switch from Vercel env; overrides the catalog/UI setting when set. */
export function readPasswordLoginEnvOverride(): PasswordLoginEnvOverride {
  const raw = process.env.PASSWORD_LOGIN?.trim();
  if (raw === "0" || raw?.toLowerCase() === "false") {
    return "force-off";
  }
  if (raw === "1" || raw?.toLowerCase() === "true") {
    return "force-on";
  }
  return null;
}

/** Stored catalog value; undefined means enabled (Kevin stays able to sign in). */
export function effectivePasswordLoginEnabled(storedEnabled?: boolean): boolean {
  const env = readPasswordLoginEnvOverride();
  if (env === "force-off") {
    return false;
  }
  if (env === "force-on") {
    return true;
  }
  return storedEnabled !== false;
}

export type SignInOptions = {
  passwordLoginEnabled: boolean;
  microsoftSignInEnabled: boolean;
  passwordLoginEnvOverride: PasswordLoginEnvOverride;
  /** Value persisted in the catalog before env override. */
  passwordLoginStoredEnabled: boolean;
};

export async function getSignInOptions(): Promise<SignInOptions> {
  const stored = await getPlatformSignInSettingsFromCatalog();
  const passwordLoginStoredEnabled = stored.passwordLoginEnabled !== false;
  return {
    passwordLoginStoredEnabled,
    passwordLoginEnabled: effectivePasswordLoginEnabled(stored.passwordLoginEnabled),
    microsoftSignInEnabled: isMicrosoftSignInEnabled(),
    passwordLoginEnvOverride: readPasswordLoginEnvOverride(),
  };
}

/** Used by POST /api/auth/login before verifying credentials. */
export async function assertPasswordLoginAllowed(): Promise<
  { ok: true } | { ok: false; message: string; status: 403 }
> {
  const signIn = await getSignInOptions();
  if (!signIn.passwordLoginEnabled) {
    return { ok: false, message: PASSWORD_LOGIN_DISABLED_MESSAGE, status: 403 };
  }
  return { ok: true };
}

export function passwordLoginBlockedResponse(status: 403 = 403) {
  return { status, message: PASSWORD_LOGIN_DISABLED_MESSAGE } as const;
}

/** Maps persisted sign-in policy to login surface flags (SSR + `/api/auth/sign-in-options`). */
export function loginSurfaceFlags(options: {
  passwordLoginEnabled: boolean;
  microsoftSignInEnabled: boolean;
}) {
  return {
    passwordLoginEnabled: options.passwordLoginEnabled,
    microsoftSignInEnabled: options.microsoftSignInEnabled,
    signInUnavailable:
      !options.passwordLoginEnabled && !options.microsoftSignInEnabled,
  };
}
