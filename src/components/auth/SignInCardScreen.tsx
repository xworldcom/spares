"use client";

import { LoginForm } from "@/components/auth/LoginForm";
import { BrandMark } from "@/components/brand/BrandMark";

export function SignInCardScreen({
  nextPath = "/machines",
  microsoftSignInEnabled = false,
  passwordLoginEnabled = true,
  authErrorCode = null,
  deniedTenantId = null,
  signedOut = false,
}: {
  nextPath?: string;
  microsoftSignInEnabled?: boolean;
  passwordLoginEnabled?: boolean;
  authErrorCode?: string | null;
  deniedTenantId?: string | null;
  signedOut?: boolean;
}) {
  return (
    <div className="login-page">
      <div className="login-page-card">
        <BrandMark className="login-page-wordmark" />
        <p className="login-kicker">Invite-only access</p>
        <LoginForm
          nextPath={nextPath}
          microsoftSignInEnabled={microsoftSignInEnabled}
          passwordLoginEnabled={passwordLoginEnabled}
          authErrorCode={authErrorCode}
          deniedTenantId={deniedTenantId}
          signedOut={signedOut}
        />
      </div>
    </div>
  );
}
