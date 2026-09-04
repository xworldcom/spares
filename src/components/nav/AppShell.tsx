"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { BugReportControl } from "@/components/bug-report/BugReportControl";
import { MobileTabBar } from "@/components/nav/MobileTabBar";
import { useQuoteAlerts } from "@/components/quote/QuoteAlerts";
import { errorMessage } from "@/lib/api/errors";
import { isNavActive } from "@/lib/nav-active";

const CUSTOMER_NAV_HREFS = ["/machines", "/quotes"] as const;
const STAFF_NAV_HREFS = [
  "/machines",
  "/machines/new",
  "/staff/customers",
  "/staff/quotes",
  "/staff/bugs",
] as const;

function NavLink({
  href,
  hrefs,
  children,
}: {
  href: string;
  hrefs: readonly string[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = isNavActive(pathname, href, hrefs);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "btn-primary inline-flex h-11 items-center rounded-full px-3.5 text-sm font-medium"
          : "inline-flex h-11 items-center rounded-full px-3.5 text-sm font-medium text-neutral-700 transition-colors duration-200 hover:bg-neutral-200/70 hover:text-neutral-950"
      }
    >
      {children}
    </Link>
  );
}

function QuotesNavLink({
  href,
  hrefs,
  unreadCount,
}: {
  href: string;
  hrefs: readonly string[];
  unreadCount: number;
}) {
  return (
    <span className="relative inline-flex">
      <NavLink href={href} hrefs={hrefs}>
        Quotes
      </NavLink>
      {unreadCount > 0 ? (
        <span className="absolute -top-0.5 -right-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-[#0a84ff] px-1 text-[10px] font-semibold text-white">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      ) : null}
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status, user, logout } = useAuth();
  const { unreadCount } = useQuoteAlerts();
  const pathname = usePathname();
  const router = useRouter();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const machineStage = /^\/machines\/[^/]+$/.test(pathname) && pathname !== "/machines/new";
  const onLogin = pathname === "/login";
  const signedIn = status === "signed-in" && user;
  const showTabs = Boolean(signedIn && !machineStage && !onLogin);
  const navHrefs = user?.role === "staff" ? STAFF_NAV_HREFS : CUSTOMER_NAV_HREFS;

  async function handleLogout() {
    setLogoutError(null);
    try {
      await logout();
      router.push("/login");
    } catch (cause) {
      setLogoutError(errorMessage(cause, "Could not sign out."));
    }
  }

  return (
    <div
      className={
        machineStage
          ? "spares-app spares-app-stage flex min-h-dvh flex-col bg-[#f4f5f7] text-[#0b0d10]"
          : showTabs
            ? "spares-app spares-app-tabs min-h-dvh bg-[#f4f5f7] text-[#0b0d10]"
            : "spares-app min-h-dvh bg-[#f4f5f7] text-[#0b0d10]"
      }
    >
      <header className="spares-header sticky top-0 z-[60] shrink-0 bg-[#f4f5f7]/94 backdrop-blur-md">
        <div className="spares-header-inner mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:px-4">
          {machineStage ? (
            <Link
              href="/machines"
              className="inline-flex h-11 min-w-0 shrink items-center gap-1 rounded-full px-2 text-[15px] font-semibold tracking-tight"
            >
              <span aria-hidden="true" className="text-lg leading-none text-neutral-400">
                ‹
              </span>
              <span className="truncate">Machines</span>
            </Link>
          ) : (
            <Link
              href="/"
              className="inline-flex h-11 min-w-11 shrink-0 items-center rounded-full px-2 text-[15px] font-semibold tracking-tight"
            >
              Spares
            </Link>
          )}

          {signedIn ? (
            <nav
              className="hidden min-w-0 flex-1 items-center overflow-x-auto lg:flex"
              aria-label="Main"
            >
              <NavLink href="/machines" hrefs={navHrefs}>
                Machines
              </NavLink>
              {user.role === "staff" ? (
                <>
                  <NavLink href="/machines/new" hrefs={navHrefs}>
                    Upload
                  </NavLink>
                  <NavLink href="/staff/customers" hrefs={navHrefs}>
                    Customers
                  </NavLink>
                  <QuotesNavLink
                    href="/staff/quotes"
                    hrefs={navHrefs}
                    unreadCount={unreadCount}
                  />
                  <NavLink href="/staff/bugs" hrefs={navHrefs}>
                    Bug reports
                  </NavLink>
                </>
              ) : (
                <QuotesNavLink
                  href="/quotes"
                  hrefs={navHrefs}
                  unreadCount={unreadCount}
                />
              )}
            </nav>
          ) : (
            <div className="min-w-0 flex-1" />
          )}

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <p className="spares-muted hidden text-[11px] font-medium tracking-[0.14em] uppercase sm:block">
              Private
            </p>
            <BugReportControl />
            {signedIn ? (
              <button
                type="button"
                onClick={() => {
                  void handleLogout();
                }}
                className="inline-flex h-11 items-center rounded-full px-3 text-sm font-medium text-neutral-800 transition-colors duration-200 hover:bg-neutral-200/80"
              >
                Sign out
              </button>
            ) : onLogin ? null : (
              <Link
                href="/login"
                className="btn-primary inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
        {logoutError ? (
          <p className="px-4 py-2 text-sm text-red-700" role="alert">
            {logoutError}
          </p>
        ) : null}
      </header>
      <main
        className={
          machineStage
            ? "mx-auto flex w-full min-h-0 max-w-7xl flex-1 flex-col px-3 pt-2 pb-2 sm:px-4"
            : "mx-auto w-full max-w-6xl px-4 py-5 sm:py-8"
        }
      >
        {children}
      </main>
      {showTabs ? <MobileTabBar /> : null}
    </div>
  );
}
