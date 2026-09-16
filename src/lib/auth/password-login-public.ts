/** Client-safe sign-in copy and helpers — no store or Node-only imports. */

export const PASSWORD_LOGIN_DISABLED_MESSAGE =
  "Email and password sign-in is turned off. Sign in with Microsoft or contact your admin.";

export const PASSWORD_LOGIN_DISABLED_CODE = "password_login_disabled";

export const PASSWORD_LOGIN_UNAVAILABLE_MESSAGE =
  "Sign-in is unavailable right now. Contact your platform admin to enable Microsoft SSO or password sign-in.";

/** Maps sign-in flags passed from the server into login UI state. */
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
