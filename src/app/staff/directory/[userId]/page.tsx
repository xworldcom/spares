"use client";

import { use } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { PlatformDirectoryPersonDetail } from "@/components/staff/PlatformDirectoryPersonDetail";

export default function StaffDirectoryPersonPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = use(params);
  const { user } = useAuth();

  if (!user?.platformOwner) {
    return (
      <main className="page-shell">
        <h1 className="page-title">Directory</h1>
        <p className="text-muted">Platform owner access is required.</p>
      </main>
    );
  }

  return (
    <RequireAuth role="staff">
      <PlatformDirectoryPersonDetail userId={userId} />
    </RequireAuth>
  );
}
