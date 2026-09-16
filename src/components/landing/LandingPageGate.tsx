"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { LandingScreen } from "@/components/landing/LandingScreen";

/** Signed-out landing with wallpaper; signed-in users go straight to Machines (no flash). */
export function LandingPageGate({
  nextPath = "/machines",
  microsoftSignInEnabled = false,
  passwordLoginEnabled = true,
  authErrorCode = null,
}: {
  nextPath?: string;
  microsoftSignInEnabled?: boolean;
  passwordLoginEnabled?: boolean;
  authErrorCode?: string | null;
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
    <LandingScreen
      nextPath={nextPath}
      microsoftSignInEnabled={microsoftSignInEnabled}
      passwordLoginEnabled={passwordLoginEnabled}
      authErrorCode={authErrorCode}
    />
  );
}
