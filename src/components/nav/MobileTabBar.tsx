"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCareAlerts } from "@/components/care/CareAlerts";
import { useQuoteAlerts } from "@/components/quote/QuoteAlerts";
import { useLifecycleAlerts } from "@/components/notifications/LifecycleAlerts";
import { usePlatformInquiryAlerts } from "@/components/platform/PlatformInquiryAlerts";
import {
  machinesFamilyActive,
  staffMachinesMenuLinks,
} from "@/components/nav/MachinesNavMenu";
import { isNavActive } from "@/lib/nav-active";
import { ACTIVITY_LOG_ENABLED } from "@/lib/activity-log-public";
import {
  CUSTOMER_PART_ALERTS_HREF,
  STAFF_PART_ALERTS_HREF,
} from "@/lib/nav/part-alerts-routes";

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

function CareIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
      <path
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={active ? 0 : 1.7}
        d="M12 3.5 4.5 7.25v9.5L12 20.5l7.5-3.75v-9.5L12 3.5zm0 2.2 5.2 2.6L12 10.9 6.8 8.3 12 5.7z"
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

function PartAlertsIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
      <path
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={active ? 0 : 1.7}
        d="M12 3a5.5 5.5 0 0 0-5.5 5.5v2.25L4.5 13v1.5h15V13l-2-2.25V8.5A5.5 5.5 0 0 0 12 3zm0 18a2.25 2.25 0 0 0 2.15-1.6H9.85A2.25 2.25 0 0 0 12 21z"
      />
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
  badgeAriaLabel,
  onNavigate,
  children,
}: {
  href: string;
  hrefs: readonly string[];
  label: string;
  badge?: number;
  badgeAriaLabel?: string;
  onNavigate?: () => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = isNavActive(pathname, href, hrefs);
  const ariaLabel =
    badgeAriaLabel ??
    (badge && badge > 0 ? `${label}, ${badge} unread` : undefined);
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
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
  const { unreadCount: careUnreadCount } = useCareAlerts();
  const { unreadCount: quotesUnreadCount } = useQuoteAlerts();
  const { unreadCount: lifecycleUnreadCount } = useLifecycleAlerts();
  const { newCount: inquiryNewCount } = usePlatformInquiryAlerts();
  const pathname = usePathname();
  const [moreForPath, setMoreForPath] = useState<string | null>(null);
  const [machinesForPath, setMachinesForPath] = useState<string | null>(null);

  const customerHrefs = [
    "/machines",
    "/care",
    "/quotes",
    CUSTOMER_PART_ALERTS_HREF,
  ] as const;
  const staffHrefs = [
    // keep in sync with AppShell STAFF_NAV_HREFS
    "/machines",
    "/machines/new",
    "/care",
    "/staff/directory",
    "/staff/parts",
    STAFF_PART_ALERTS_HREF,
    "/staff/activity",
    "/staff/quotes",
    "/staff/bugs",
    "/staff/platform",
    "/staff/platform/inquiries",
  ] as const;
  const moreActive =
    user?.role === "staff" &&
    (isNavActive(pathname, "/staff/directory", staffHrefs) ||
      isNavActive(pathname, "/staff/parts", staffHrefs) ||
      isNavActive(pathname, "/staff/activity", staffHrefs) ||
      isNavActive(pathname, "/staff/bugs", staffHrefs) ||
      isNavActive(pathname, "/staff/platform", staffHrefs) ||
      isNavActive(pathname, "/staff/platform/inquiries", staffHrefs));
  const moreOpen = moreForPath === pathname;
  const machinesMenuOpen = machinesForPath === pathname;
  const staffMachinesActive = machinesFamilyActive(pathname, staffHrefs);

  function closeOverlayMenus() {
    setMoreForPath(null);
    setMachinesForPath(null);
  }

  if (!user) {
    return null;
  }

  return (
    <>
      {machinesMenuOpen ? (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <button
            type="button"
            aria-label="Close machines menu"
            className="absolute inset-0 bg-black/25"
            onClick={closeOverlayMenus}
          />
          <div
            className="spares-surface absolute inset-x-3 rounded-[24px] p-2 shadow-[0_16px_40px_rgba(0,0,0,0.42)]"
            style={{
              bottom: "calc(var(--spares-tabbar) + env(safe-area-inset-bottom) + 0.5rem)",
            }}
          >
            {staffMachinesMenuLinks(() => setMachinesForPath(null))}
          </div>
        </div>
      ) : null}

      {moreOpen ? (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <button
            type="button"
            aria-label="Close more menu"
            className="absolute inset-0 bg-black/25"
            onClick={closeOverlayMenus}
          />
          <div
            className="spares-surface absolute inset-x-3 rounded-[24px] p-2 shadow-[0_16px_40px_rgba(0,0,0,0.42)]"
            style={{
              bottom: "calc(var(--spares-tabbar) + env(safe-area-inset-bottom) + 0.5rem)",
            }}
          >
            <Link
              href="/staff/directory"
              className="flex min-h-12 items-center rounded-2xl px-4 text-[16px] font-medium"
            >
              Directory
            </Link>
            <Link
              href="/staff/parts"
              className="flex min-h-12 items-center rounded-2xl px-4 text-[16px] font-medium"
            >
              Part lifecycle
            </Link>
            {ACTIVITY_LOG_ENABLED ? (
              <Link
                href="/staff/activity"
                className="flex min-h-12 items-center rounded-2xl px-4 text-[16px] font-medium"
              >
                Activity Log
              </Link>
            ) : null}
            <Link
              href="/staff/bugs"
              className="flex min-h-12 items-center rounded-2xl px-4 text-[16px] font-medium"
            >
              Bug reports
            </Link>
            {user.platformOwner ? (
              <>
                <Link
                  href="/staff/platform"
                  className="flex min-h-12 items-center rounded-2xl px-4 text-[16px] font-medium"
                >
                  Platform
                </Link>
                <Link
                  href="/staff/platform/inquiries"
                  className="flex min-h-12 items-center justify-between gap-2 rounded-2xl px-4 text-[16px] font-medium"
                >
                  Inquiries
                  {inquiryNewCount > 0 ? (
                    <span className="btn-accent inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold">
                      {inquiryNewCount > 9 ? "9+" : inquiryNewCount}
                    </span>
                  ) : null}
                </Link>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <nav
        aria-label="Primary"
        className="spares-tabbar fixed inset-x-0 bottom-0 z-[70] border-t border-white/8 backdrop-blur-md lg:hidden"
      >
        <div className="mx-auto flex max-w-lg items-stretch px-2 pt-1">
          {user.role === "staff" ? (
            <>
              <button
                type="button"
                aria-expanded={machinesMenuOpen}
                onClick={() => {
                  setMoreForPath(null);
                  setMachinesForPath((current) =>
                    current === pathname ? null : pathname,
                  );
                }}
                onPointerDown={(event) => event.stopPropagation()}
                className={`relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-[11px] font-semibold ${
                  staffMachinesActive || machinesMenuOpen
                    ? "text-[var(--spares-ink)]"
                    : "text-[var(--spares-muted)]"
                }`}
              >
                <MachinesIcon active={staffMachinesActive || machinesMenuOpen} />
                <span>Machines</span>
              </button>
              <TabLink
                href="/care/tickets"
                hrefs={staffHrefs}
                label="Care"
                badge={careUnreadCount}
                onNavigate={closeOverlayMenus}
              >
                <CareIcon active={isNavActive(pathname, "/care", staffHrefs)} />
              </TabLink>
              <TabLink
                href="/staff/quotes"
                hrefs={staffHrefs}
                label="Quotes"
                badge={quotesUnreadCount}
                onNavigate={closeOverlayMenus}
              >
                <QuotesIcon active={isNavActive(pathname, "/staff/quotes", staffHrefs)} />
              </TabLink>
              <TabLink
                href={STAFF_PART_ALERTS_HREF}
                hrefs={staffHrefs}
                label="Part alerts"
                onNavigate={closeOverlayMenus}
                badge={lifecycleUnreadCount}
                badgeAriaLabel={
                  lifecycleUnreadCount > 0
                    ? `Part alerts, ${lifecycleUnreadCount} unread obsolete part alerts`
                    : undefined
                }
              >
                <PartAlertsIcon
                  active={isNavActive(pathname, STAFF_PART_ALERTS_HREF, staffHrefs)}
                />
              </TabLink>
              <button
                type="button"
                aria-expanded={moreOpen}
                onClick={() => {
                  setMachinesForPath(null);
                  setMoreForPath((current) => (current === pathname ? null : pathname));
                }}
                onPointerDown={(event) => event.stopPropagation()}
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
              <TabLink
                href="/machines"
                hrefs={customerHrefs}
                label="Machines"
                onNavigate={closeOverlayMenus}
              >
                <MachinesIcon active={isNavActive(pathname, "/machines", customerHrefs)} />
              </TabLink>
              <TabLink
                href="/care/tickets"
                hrefs={customerHrefs}
                label="Care"
                badge={careUnreadCount}
                onNavigate={closeOverlayMenus}
              >
                <CareIcon active={isNavActive(pathname, "/care", customerHrefs)} />
              </TabLink>
              <TabLink
                href="/quotes"
                hrefs={customerHrefs}
                label="Quotes"
                badge={quotesUnreadCount}
                onNavigate={closeOverlayMenus}
              >
                <QuotesIcon active={isNavActive(pathname, "/quotes", customerHrefs)} />
              </TabLink>
              <TabLink
                href={CUSTOMER_PART_ALERTS_HREF}
                hrefs={customerHrefs}
                label="Part alerts"
                onNavigate={closeOverlayMenus}
                badge={lifecycleUnreadCount}
                badgeAriaLabel={
                  lifecycleUnreadCount > 0
                    ? `Part alerts, ${lifecycleUnreadCount} unread obsolete part alerts`
                    : undefined
                }
              >
                <PartAlertsIcon
                  active={isNavActive(pathname, CUSTOMER_PART_ALERTS_HREF, customerHrefs)}
                />
              </TabLink>
            </>
          )}
        </div>
      </nav>
    </>
  );
}
