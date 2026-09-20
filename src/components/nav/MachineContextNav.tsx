"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { PrefetchLink } from "@/components/nav/PrefetchLink";
import { useMachineName } from "@/components/nav/useMachineName";
import {
  machineContextTabFromPath,
  machineContextTabs,
  machineTabHref,
  type MachineContextTab,
} from "@/lib/machine-context";
import {
  prefetchAppRoute,
  prefetchCareTabRoutes,
  warmCareOverview,
  warmQuotesList,
} from "@/lib/nav/prefetch";

export function MachineContextNav({
  machineId,
  machineName,
  activeTab,
  asHeading = false,
}: {
  machineId: string;
  machineName?: string;
  activeTab?: MachineContextTab;
  asHeading?: boolean;
}) {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const staff = user?.role === "staff";
  const current = activeTab ?? machineContextTabFromPath(pathname) ?? "model";
  const tabs = machineContextTabs(staff);
  const Heading = asHeading ? "h1" : "p";
  const provided = machineName?.trim() || "";
  const fetchedName = useMachineName(provided ? null : machineId);
  const name = provided || fetchedName || "Machine";

  useEffect(() => {
    for (const href of prefetchCareTabRoutes(machineId, staff)) {
      prefetchAppRoute(router, href);
    }
    prefetchAppRoute(router, machineTabHref(machineId, "model"));
    prefetchAppRoute(router, machineTabHref(machineId, "quotes"));
    warmCareOverview(machineId);
    warmQuotesList();
  }, [machineId, router, staff]);

  return (
    <div className="machine-context">
      <Heading className="machine-context-name">{name}</Heading>
      <nav className="machine-context-tabs" aria-label="Machine">
        {tabs.map((tab) => {
          const href = machineTabHref(machineId, tab.id);
          const active = current === tab.id;
          return (
            <PrefetchLink
              key={tab.id}
              href={href}
              warm={() => {
                if (tab.id !== "model") {
                  warmCareOverview(machineId);
                }
                if (tab.id === "quotes") {
                  warmQuotesList();
                }
              }}
              aria-current={active ? "page" : undefined}
              className={active ? "machine-context-tab is-active" : "machine-context-tab"}
            >
              {tab.label}
            </PrefetchLink>
          );
        })}
      </nav>
    </div>
  );
}
