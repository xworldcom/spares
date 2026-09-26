import { LandingPageGate } from "@/components/landing/LandingPageGate";
import { PASSWORD_LOGIN_DISABLED_CODE } from "@/lib/auth/password-login-public";
import { getSignInOptions } from "@/lib/auth/password-login.server";
import { sanitizeNextPath } from "@/lib/auth/safe-url";
import { isEntraTenantId } from "@/lib/auth/sso-domain";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; tid?: string }>;
}) {
  const { next, error, tid } = await searchParams;
  const nextPath = sanitizeNextPath(next);
  const deniedTenantId = tid && isEntraTenantId(tid) ? tid : null;
  const signIn = await getSignInOptions();
  const authErrorCode =
    error === PASSWORD_LOGIN_DISABLED_CODE || error === "password_login_disabled"
      ? PASSWORD_LOGIN_DISABLED_CODE
      : (error ?? null);

  return (
    <LandingPageGate
      nextPath={nextPath}
      microsoftSignInEnabled={signIn.microsoftSignInEnabled}
      passwordLoginEnabled={signIn.passwordLoginEnabled}
      authErrorCode={authErrorCode}
      deniedTenantId={deniedTenantId}
    />
  );
}
