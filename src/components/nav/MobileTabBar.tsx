"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useQuoteAlerts } from "@/components/quote/QuoteAlerts";
import { isNavActive } from "@/lib/nav-active";

function MachinesIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
      <path
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={active ? 0 : 1.7}
        d="M4.5 8.2 12 4l7.5 4.2v7.6L12 20l-7.5-4.2V8.2z"
      />
    </svg>
  );
}

function QuotesIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
      <path
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={active ? 0 : 1.7}
        d="M6 4.5h12A1.5 1.5 0 0 1 19.5 6v14L12 16.5 4.5 20V6A1.5 1.5 0 0 1 6 4.5z"
      />
    </svg>
  );
}

function UploadIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 16.5V7.5m0 0-3.5 3.5M12 7.5l3.5 3.5M5 18.5h14"
      />
      {active ? <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.12" /> : null}
    </svg>
  );
}

function MoreIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
      <circle cx="6" cy="12" r={active ? 2.1 : 1.6} fill="currentColor" />
      <circle cx="12" cy="12" r={active ? 2.1 : 1.6} fill="currentColor" />
      <circle cx="18" cy="12" r={active ? 2.1 : 1.6} fill="currentColor" />
    </svg>
  );
}

function TabLink({
  href,
  hrefs,
  label,
  badge,
  children,
}: {
  href: string;
  hrefs: readonly string[];
  label: string;
  badge?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = isNavActive(pathname, href, hrefs);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-[11px] font-semibold ${
        active ? "text-[var(--spares-ink)]" : "text-[var(--spares-muted)]"
      }`}
    >
      {children}
      <span>{label}</span>
      {badge && badge > 0 ? (
        <span className="btn-accent absolute top-0.5 right-[calc(50%-1.35rem)] inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold">
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

export function MobileTabBar() {
  const { user } = useAuth();
  const { unreadCount } = useQuoteAlerts();
  const pathname = usePathname();
  const [moreForPath, setMoreForPath] = useState<string | null>(null);

  const customerHrefs = ["/machines", "/quotes"] as const;
  const staffHrefs = [
    "/machines",
    "/machines/new",
    "/staff/customers",
    "/staff/quotes",
    "/staff/bugs",
  ] as const;
  const moreActive =
    user?.role === "staff" &&
    (isNavActive(pathname, "/staff/customers", staffHrefs) ||
      isNavActive(pathname, "/staff/bugs", staffHrefs));
  const moreOpen = moreForPath === pathname;

  if (!user) {
    return null;
  }

  return (
    <>
      {moreOpen ? (
        <div className="fixed inset-0 z-[55] lg:hidden">
          <button
            type="button"
            aria-label="Close more menu"
            className="absolute inset-0 bg-black/25"
            onClick={() => setMoreForPath(null)}
          />
          <div
            className="spares-surface absolute inset-x-3 rounded-[24px] p-2 shadow-[0_16px_40px_rgba(12,13,15,0.14)]"
            style={{
              bottom: "calc(var(--spares-tabbar) + env(safe-area-inset-bottom) + 0.5rem)",
            }}
          >
            <Link
              href="/staff/customers"
              className="flex min-h-12 items-center rounded-2xl px-4 text-[16px] font-medium"
            >
              Customers
            </Link>
            <Link
              href="/staff/bugs"
              className="flex min-h-12 items-center rounded-2xl px-4 text-[16px] font-medium"
            >
              Bug reports
            </Link>
          </div>
        </div>
      ) : null}

      <nav
        aria-label="Primary"
        className="spares-tabbar fixed inset-x-0 bottom-0 z-[56] border-t border-black/5 backdrop-blur-md lg:hidden"
      >
        <div className="mx-auto flex max-w-lg items-stretch px-2 pt-1">
          {user.role === "staff" ? (
            <>
              <TabLink href="/machines" hrefs={staffHrefs} label="Machines">
                <MachinesIcon active={isNavActive(pathname, "/machines", staffHrefs)} />
              </TabLink>
              <TabLink href="/machines/new" hrefs={staffHrefs} label="Upload">
                <UploadIcon active={isNavActive(pathname, "/machines/new", staffHrefs)} />
              </TabLink>
              <TabLink
                href="/staff/quotes"
                hrefs={staffHrefs}
                label="Quotes"
                badge={unreadCount}
              >
                <QuotesIcon active={isNavActive(pathname, "/staff/quotes", staffHrefs)} />
              </TabLink>
              <button
                type="button"
                aria-expanded={moreOpen}
                onClick={() =>
                  setMoreForPath((current) => (current === pathname ? null : pathname))
                }
                className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-[11px] font-semibold ${
                  moreActive || moreOpen ? "text-[var(--spares-ink)]" : "text-[var(--spares-muted)]"
                }`}
              >
                <MoreIcon active={moreActive || moreOpen} />
                <span>More</span>
              </button>
            </>
          ) : (
            <>
              <TabLink href="/machines" hrefs={customerHrefs} label="Machines">
                <MachinesIcon active={isNavActive(pathname, "/machines", customerHrefs)} />
              </TabLink>
              <TabLink
                href="/quotes"
                hrefs={customerHrefs}
                label="Quotes"
                badge={unreadCount}
              >
                <QuotesIcon active={isNavActive(pathname, "/quotes", customerHrefs)} />
              </TabLink>
            </>
          )}
        </div>
      </nav>
    </>
  );
}
