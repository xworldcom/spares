"use client";

import { use } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { PlatformDirectoryPersonDetail } from "@/components/staff/PlatformDirectoryPersonDetail";
import { TenantDirectoryPersonDetail } from "@/components/staff/TenantDirectoryPersonDetail";

export default function StaffDirectoryPersonPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = use(params);
  const { user } = useAuth();

  return (
    <RequireAuth role="staff">
      {user?.platformOwner ? (
        <PlatformDirectoryPersonDetail userId={userId} />
      ) : (
        <TenantDirectoryPersonDetail userId={userId} />
      )}
    </RequireAuth>
  );
}
