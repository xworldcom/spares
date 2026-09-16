"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { getMachine } from "@/lib/api/machines";
import { careHref } from "@/lib/care";

const TABS: {
  id: "overview" | "manuals" | "tickets" | "service";
  label: string;
  staffOnly?: boolean;
}[] = [
  { id: "overview", label: "Overview" },
  { id: "manuals", label: "Manuals" },
  { id: "tickets", label: "Tickets" },
  { id: "service", label: "Service", staffOnly: true },
];

function tabFromPath(pathname: string) {
  if (pathname.includes("/care/manuals")) {
    return "manuals";
  }
  if (pathname.includes("/care/tickets")) {
    return "tickets";
  }
  if (pathname.includes("/care/service") || pathname.includes("/care/usage")) {
    return "service";
  }
  return "overview";
}

export function CareFrame({
  machineId,
  children,
}: {
  machineId: string;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const pathname = usePathname();
  const current = tabFromPath(pathname);
  const staff = user?.role === "staff";
  const [machineName, setMachineName] = useState("Machine");

  useEffect(() => {
    let cancelled = false;
    getMachine(machineId, user?.role)
      .then((machine) => {
        if (!cancelled) {
          setMachineName(machine.name);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMachineName("Machine");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [machineId, user?.role]);

  return (
    <div className="care-page">
      <header className="care-hero">
        <Link href={`/machines/${machineId}`} className="care-back">
          <span aria-hidden="true">‹</span> 3D model
        </Link>
        <p className="care-kicker">Machine Care</p>
        <h1>{machineName}</h1>
        <p className="spares-muted care-lede">
          Manuals, service tickets, and plant notes for this machine.
        </p>
      </header>

      <nav className="care-tabs" aria-label="Care sections">
        {TABS.filter((tab) => !tab.staffOnly || staff).map((tab) => {
          const href = careHref(machineId, tab.id);
          const active = current === tab.id;
          return (
            <Link
              key={tab.id}
              href={href}
              aria-current={active ? "page" : undefined}
              className={active ? "care-tab is-active" : "care-tab"}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className="care-body">{children}</div>
    </div>
  );
}
