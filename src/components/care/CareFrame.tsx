"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();

  useEffect(() => {
    for (const href of prefetchCareTabRoutes(machineId)) {
      prefetchAppRoute(router, href);
    }
    warmCareOverview(machineId);
  }, [machineId, router]);

  return <div className="care-page">{children}</div>;
}
