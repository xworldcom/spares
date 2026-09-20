"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  prefetchAppRoute,
  prefetchCareTabRoutes,
  warmCareOverview,
} from "@/lib/nav/prefetch";

export function CareFrame({
  machineId,
  children,
}: {
  machineId: string;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const staff = user?.role === "staff";

  useEffect(() => {
    for (const href of prefetchCareTabRoutes(machineId, staff)) {
      prefetchAppRoute(router, href);
    }
    warmCareOverview(machineId);
  }, [machineId, router, staff]);

  return <div className="care-page">{children}</div>;
}
