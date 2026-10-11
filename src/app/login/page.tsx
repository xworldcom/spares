import { SignInGate } from "@/components/auth/SignInGate";
import { PASSWORD_LOGIN_DISABLED_CODE } from "@/lib/auth/password-login-public";
import { getSignInOptions } from "@/lib/auth/password-login.server";
import { sanitizeNextPath } from "@/lib/auth/safe-url";
import { isEntraTenantId } from "@/lib/auth/sso-domain";

export const revalidate = 3600;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; tid?: string; reason?: string }>;
}) {
  const { next, error, tid, reason } = await searchParams;
  const nextPath = sanitizeNextPath(next);
  const deniedTenantId = tid && isEntraTenantId(tid) ? tid : null;
  const signIn = await getSignInOptions();
  const authErrorCode =
    error === PASSWORD_LOGIN_DISABLED_CODE || error === "password_login_disabled"
      ? PASSWORD_LOGIN_DISABLED_CODE
      : (error ?? null);

  return (
    <SignInGate
      nextPath={nextPath}
      microsoftSignInEnabled={signIn.microsoftSignInEnabled}
      passwordLoginEnabled={signIn.passwordLoginEnabled}
      authErrorCode={authErrorCode}
      deniedTenantId={deniedTenantId}
      signedOut={reason === "signed-out"}
    />
  );
}
