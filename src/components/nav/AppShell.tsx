"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { BugReportControl } from "@/components/bug-report/BugReportControl";
import { MobileTabBar } from "@/components/nav/MobileTabBar";
import { useQuoteAlerts } from "@/components/quote/QuoteAlerts";
import { errorMessage } from "@/lib/api/errors";
import { isNavActive } from "@/lib/nav-active";
import {
  scheduleVisualViewportSync,
  subscribeVisualViewport,
  syncVisualViewportBottom,
} from "@/lib/ui/visual-viewport";

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
          ? "inline-flex h-11 items-center px-3 text-sm font-semibold tracking-tight"
          : "spares-muted inline-flex h-11 items-center px-3 text-sm font-medium tracking-tight transition-colors duration-200 hover:text-[var(--spares-ink)]"
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
        <span className="btn-accent absolute -top-0.5 -right-0.5 inline-flex min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold">
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

  useEffect(() => {
    const root = document.documentElement;
    function syncViewport() {
      const embedded = window.parent !== window;
      root.classList.toggle("spares-embed", embedded);
      const vv = window.visualViewport;
      const top = vv ? Math.max(0, Math.round(vv.offsetTop)) : 0;
      root.style.setProperty("--embed-top", embedded ? `${top}px` : "0px");
      syncVisualViewportBottom(root, window.innerHeight, vv);
    }
    return subscribeVisualViewport(() => {
      scheduleVisualViewportSync(syncViewport);
    }, window);
  }, []);
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
        onLogin
          ? "spares-app spares-app-login min-h-dvh"
          : machineStage
            ? "spares-app spares-app-stage flex min-h-dvh flex-col"
            : showTabs
              ? "spares-app spares-app-tabs min-h-dvh"
              : "spares-app min-h-dvh"
      }
    >
      <header className="spares-header sticky top-0 z-[60] shrink-0 backdrop-blur-md">
        <div className="spares-header-inner mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:px-4">
          {machineStage ? (
            <Link
              href="/machines"
              className="inline-flex h-11 min-w-0 shrink items-center gap-1 px-2 text-[15px] font-semibold tracking-tight"
            >
              <span aria-hidden="true" className="spares-muted text-lg leading-none">
                ‹
              </span>
              <span className="truncate">Machines</span>
            </Link>
          ) : (
            <Link
              href="/"
              className="relative inline-flex h-11 min-h-11 min-w-11 shrink-0 items-center px-2 text-[16px] font-semibold tracking-tight before:absolute before:inset-0 before:min-h-11 before:min-w-11 before:content-['']"
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
            <p className="spares-muted hidden text-[11px] font-medium tracking-[0.2em] uppercase sm:block">
              Private
            </p>
            <BugReportControl />
            {signedIn ? (
              <button
                type="button"
                onClick={() => {
                  void handleLogout();
                }}
                className="spares-muted inline-flex h-11 items-center px-3 text-sm font-medium transition-colors duration-200 hover:text-[var(--spares-ink)]"
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
          <p className="px-4 py-2 text-sm text-[#f0c4c0]" role="alert">
            {logoutError}
          </p>
        ) : null}
      </header>
      <main
        className={
          machineStage
            ? "mx-auto flex w-full min-h-0 max-w-7xl flex-1 flex-col px-0 pt-0 pb-0 sm:px-4 sm:pt-2 sm:pb-2"
            : "mx-auto w-full max-w-6xl px-4 py-5 sm:py-8"
        }
      >
        {children}
      </main>
      {showTabs ? <MobileTabBar /> : null}
    </div>
  );
}
