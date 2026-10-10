"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { SignInCardScreen } from "@/components/auth/SignInCardScreen";

/** `/login` only — centered card; `/` keeps full landing hero. */
export function SignInGate({
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
  const { status, user } = useAuth();
  const router = useRouter();
  const signedIn = status === "signed-in" && user;

  useEffect(() => {
    if (signedIn) {
      router.replace(nextPath.startsWith("/") ? nextPath : "/machines");
    }
  }, [router, signedIn, nextPath]);

  if (signedIn) {
    return null;
  }

  return (
    <SignInCardScreen
      nextPath={nextPath}
      microsoftSignInEnabled={microsoftSignInEnabled}
      passwordLoginEnabled={passwordLoginEnabled}
      authErrorCode={authErrorCode}
      deniedTenantId={deniedTenantId}
      signedOut={signedOut}
    />
  );
}
