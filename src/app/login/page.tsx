import { LandingPageGate } from "@/components/landing/LandingPageGate";
import {
  getSignInOptions,
  PASSWORD_LOGIN_DISABLED_CODE,
} from "@/lib/auth/password-login";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const nextPath =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/machines";
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
    />
  );
}
