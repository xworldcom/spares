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
    <div className="catalog-page care-page-wide">
      <div className="catalog-page-intro">
        <h1>Care</h1>
      </div>

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
