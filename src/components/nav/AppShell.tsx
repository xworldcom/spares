"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { BrandMark } from "@/components/brand/BrandMark";
import { BugReportControl } from "@/components/bug-report/BugReportControl";
import { MobileTabBar } from "@/components/nav/MobileTabBar";
import { StaffMachinesDesktopNav } from "@/components/nav/MachinesNavMenu";
import { useCareAlerts } from "@/components/care/CareAlerts";
import { useQuoteAlerts } from "@/components/quote/QuoteAlerts";
import { errorMessage } from "@/lib/api/errors";
import { isNavActive } from "@/lib/nav-active";

const CUSTOMER_NAV_HREFS = ["/machines", "/care", "/quotes"] as const;
const STAFF_NAV_HREFS = [
  "/machines",
  "/machines/new",
  "/care",
  "/staff/directory",
  "/staff/quotes",
  "/staff/bugs",
  "/staff/platform",
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

function NavLinkWithBadge({
  href,
  hrefs,
  label,
  unreadCount,
}: {
  href: string;
  hrefs: readonly string[];
  label: string;
  unreadCount: number;
}) {
  return (
    <span className="relative inline-flex">
      <NavLink href={href} hrefs={hrefs}>
        {label}
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
  const { unreadCount: careUnreadCount } = useCareAlerts();
  const { unreadCount: quotesUnreadCount } = useQuoteAlerts();
  const pathname = usePathname();
  const router = useRouter();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const machineStage = /^\/machines\/[^/]+$/.test(pathname) && pathname !== "/machines/new";

  useEffect(() => {
    const root = document.documentElement;
    function syncEmbed() {
      const embedded = window.parent !== window;
      root.classList.toggle("spares-embed", embedded);
      const vv = window.visualViewport;
      const top = vv ? Math.max(0, Math.round(vv.offsetTop)) : 0;
      root.style.setProperty("--embed-top", embedded ? `${top}px` : "0px");
    }
    syncEmbed();
    window.visualViewport?.addEventListener("resize", syncEmbed);
    window.visualViewport?.addEventListener("scroll", syncEmbed);
    window.addEventListener("resize", syncEmbed);
    return () => {
      window.visualViewport?.removeEventListener("resize", syncEmbed);
      window.visualViewport?.removeEventListener("scroll", syncEmbed);
      window.removeEventListener("resize", syncEmbed);
    };
  }, []);
  const onLogin = pathname === "/login" || pathname === "/";
  const signedIn = status === "signed-in" && user;
  const cinematic = onLogin && !signedIn;
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
        cinematic
          ? "spares-app spares-app-login spares-app-cinematic min-h-dvh"
          : onLogin
            ? "spares-app spares-app-login min-h-dvh"
            : machineStage
              ? "spares-app spares-app-stage flex min-h-dvh flex-col"
              : showTabs
                ? "spares-app spares-app-tabs min-h-dvh"
                : "spares-app min-h-dvh"
      }
    >
      <header className="spares-header sticky top-0 z-[60] shrink-0 backdrop-blur-md">
        <div className="spares-header-inner mx-auto flex h-14 w-full max-w-none items-center gap-2 px-3 sm:px-4 lg:px-5">
          {machineStage ? (
            <div className="flex min-w-0 items-center gap-1">
              <Link
                href="/machines"
                className="inline-flex h-11 min-w-0 shrink items-center gap-1 px-2 text-[15px] font-semibold tracking-tight"
              >
                <span aria-hidden="true" className="spares-muted text-lg leading-none">
                  ‹
                </span>
                <span className="truncate">Machines</span>
              </Link>
              <Link
                href={`${pathname}/care`}
                className="spares-muted inline-flex h-11 items-center px-2 text-sm font-medium tracking-tight transition-colors duration-200 hover:text-[var(--spares-ink)] lg:hidden"
              >
                Care
              </Link>
            </div>
          ) : (
            <Link
              href={signedIn ? "/machines" : "/"}
              className="relative inline-flex h-11 min-h-11 shrink-0 items-center px-2 before:absolute before:inset-0 before:min-h-11 before:min-w-11 before:content-['']"
            >
              <BrandMark />
            </Link>
          )}

          {signedIn ? (
            <nav
              className="hidden min-w-0 flex-1 items-center overflow-x-auto lg:flex"
              aria-label="Main"
            >
              {user.role === "staff" ? (
                <StaffMachinesDesktopNav hrefs={navHrefs} />
              ) : (
                <NavLink href="/machines" hrefs={navHrefs}>
                  Machines
                </NavLink>
              )}
              <NavLinkWithBadge
                href="/care"
                hrefs={navHrefs}
                label="Care"
                unreadCount={careUnreadCount}
              />
              {user.role === "staff" ? (
                <>
                  <NavLink href="/staff/directory" hrefs={navHrefs}>
                    Directory
                  </NavLink>
                  <NavLinkWithBadge
                    href="/staff/quotes"
                    hrefs={navHrefs}
                    label="Quotes"
                    unreadCount={quotesUnreadCount}
                  />
                  <NavLink href="/staff/bugs" hrefs={navHrefs}>
                    Bug reports
                  </NavLink>
                  {user.platformOwner ? (
                    <NavLink href="/staff/platform" hrefs={navHrefs}>
                      Platform
                    </NavLink>
                  ) : null}
                </>
              ) : (
                <NavLinkWithBadge
                  href="/quotes"
                  hrefs={navHrefs}
                  label="Quotes"
                  unreadCount={quotesUnreadCount}
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
            ) : cinematic ? null : (
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
          cinematic
            ? "w-full flex-1"
            : machineStage
              ? "mx-auto flex w-full min-h-0 max-w-none flex-1 flex-col px-0 pt-0 pb-0 sm:px-3 sm:pt-2 sm:pb-2 lg:px-4"
              : "mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-8"
        }
      >
        {children}
      </main>
      {showTabs ? <MobileTabBar /> : null}
    </div>
  );
}
