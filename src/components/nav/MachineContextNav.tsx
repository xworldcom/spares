"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { PrefetchLink } from "@/components/nav/PrefetchLink";
import { getMachine } from "@/lib/api/machines";
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
  const [name, setName] = useState(machineName?.trim() || "Machine");
  const current = activeTab ?? machineContextTabFromPath(pathname) ?? "model";
  const tabs = machineContextTabs(staff);
  const Heading = asHeading ? "h1" : "p";

  useEffect(() => {
    if (machineName?.trim()) {
      setName(machineName.trim());
    }
  }, [machineName]);

  useEffect(() => {
    for (const href of prefetchCareTabRoutes(machineId, staff)) {
      prefetchAppRoute(router, href);
    }
    prefetchAppRoute(router, machineTabHref(machineId, "model"));
    prefetchAppRoute(router, machineTabHref(machineId, "quotes"));
    warmCareOverview(machineId);
    warmQuotesList();
  }, [machineId, router, staff]);

  useEffect(() => {
    if (machineName?.trim()) {
      return;
    }
    let cancelled = false;
    getMachine(machineId, user?.role)
      .then((machine) => {
        if (!cancelled) {
          setName(machine.name);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setName("Machine");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [machineId, machineName, user?.role]);

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
