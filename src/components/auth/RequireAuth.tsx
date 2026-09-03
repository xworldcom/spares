"use client";

import type { Role } from "@/lib/api/types";
import { useAuth } from "@/components/auth/AuthProvider";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { NotSignedIn } from "@/components/states/NotSignedIn";

export function RequireAuth({
  role,
  children,
}: {
  role?: Role;
  children: React.ReactNode;
}) {
  const { status, user, error, refresh } = useAuth();

  if (status === "loading") {
    return <LoadingState label="Checking your session…" />;
  }

  if (status === "unavailable") {
    return (
      <ErrorState
        title="Could not reach the API"
        message={
          error ??
          "Auth routes are not available on this preview yet. Sign-in will work once T1.2 is merged."
        }
        onRetry={() => {
          void refresh();
        }}
      />
    );
  }

  if (status === "signed-out" || !user) {
    return <NotSignedIn />;
  }

  if (role && user.role !== role) {
    return (
      <ErrorState
        title="Wrong role"
        message={
          role === "staff"
            ? "This page is for staff only."
            : "This page is for customers only."
        }
      />
    );
  }

  return children;
}
