"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hubCareHref } from "@/lib/care";

const TABS: { id: "overview" | "tickets"; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "tickets", label: "Tickets" },
];

function tabFromPath(pathname: string) {
  if (pathname.includes("/care/tickets")) {
    return "tickets";
  }
  return "overview";
}

export function CareHubFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const current = tabFromPath(pathname);

  return (
    <div className="care-page care-page-wide">
      <header className="care-hero">
        <Link href="/machines" className="care-back">
          <span aria-hidden="true">‹</span> Machines
        </Link>
        <p className="care-kicker">Care</p>
        <h1>Service hub</h1>
        <p className="spares-muted care-lede">
          Pick a machine, browse manuals, and work tickets across your plant.
        </p>
      </header>

      <nav className="care-tabs" aria-label="Care sections">
        {TABS.map((tab) => {
          const href = hubCareHref(tab.id);
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
