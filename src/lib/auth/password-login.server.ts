import { isMicrosoftSignInEnabled } from "./microsoft.ts";
import { readPersistedPlatformSignInSettings } from "../platform-settings-persistence.ts";
import { PASSWORD_LOGIN_DISABLED_MESSAGE } from "./password-login-public.ts";

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
  const sidecar = await readPersistedPlatformSignInSettings();
  const passwordLoginStoredEnabled = sidecar?.passwordLoginEnabled !== false;
  return {
    passwordLoginStoredEnabled,
    passwordLoginEnabled: effectivePasswordLoginEnabled(sidecar?.passwordLoginEnabled),
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
