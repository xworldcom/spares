"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { BrandMark } from "@/components/brand/BrandMark";
import { BugReportControl } from "@/components/bug-report/BugReportControl";
import { MobileTabBar } from "@/components/nav/MobileTabBar";
import { StaffMachinesDesktopNav } from "@/components/nav/MachinesNavMenu";
import { MachineContextNav } from "@/components/nav/MachineContextNav";
import { MachineRouteProvider } from "@/components/nav/MachineRouteContext";
import { useMachineName } from "@/components/nav/useMachineName";
import type { MachineNameSeed } from "@/lib/machine-name-cache";
import { useCareAlerts } from "@/components/care/CareAlerts";
import { usePlatformInquiryAlerts } from "@/components/platform/PlatformInquiryAlerts";
import { useQuoteAlerts } from "@/components/quote/QuoteAlerts";
import { useLifecycleAlerts } from "@/components/notifications/LifecycleAlerts";
import { errorMessage } from "@/lib/api/errors";
import { isMachineStagePath, machineIdFromPath } from "@/lib/machine-context";
import { isNavActive } from "@/lib/nav-active";
import { useSignedInTabPrefetch } from "@/components/nav/useSignedInTabPrefetch";
import { ACTIVITY_LOG_ENABLED } from "@/lib/activity-log-public";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";

const CUSTOMER_NAV_HREFS = ["/machines", "/care", "/quotes", "/notifications"] as const;
const STAFF_NAV_HREFS = [
  "/machines",
  "/machines/new",
  "/care",
  "/staff/directory",
  "/staff/parts",
  "/staff/notifications",
  "/staff/activity",
  "/staff/quotes",
  "/staff/bugs",
  "/staff/platform",
  "/staff/platform/inquiries",
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

export function AppShell({
  children,
  machineBootstrap = null,
}: {
  children: React.ReactNode;
  machineBootstrap?: MachineNameSeed | null;
}) {
  const { status, user, logout } = useAuth();
  const { unreadCount: careUnreadCount } = useCareAlerts();
  const { unreadCount: quotesUnreadCount } = useQuoteAlerts();
  const { unreadCount: lifecycleUnreadCount } = useLifecycleAlerts();
  const { newCount: inquiryNewCount } = usePlatformInquiryAlerts();
  const pathname = usePathname();
  const router = useRouter();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const machineId = machineIdFromPath(pathname);
  const machineStage = isMachineStagePath(pathname);
  const machineName = useMachineName(machineId);

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
  const onLogin =
    pathname === "/login" || pathname === "/" || pathname === "/inquire";
  const signedIn = status === "signed-in" && user;
  const resolvingSession = status === "loading";
  const cinematic = (pathname === "/" || pathname === "/inquire") && !signedIn;
  const showTabs = Boolean(signedIn && !machineStage && !onLogin);
  const navHrefs = user?.role === "staff" ? STAFF_NAV_HREFS : CUSTOMER_NAV_HREFS;
  useSignedInTabPrefetch(signedIn ? user?.role : undefined);

  async function handleLogout() {
    setLogoutError(null);
    setLogoutBusy(true);
    try {
      await logout();
      setLogoutConfirmOpen(false);
      router.push("/login");
    } catch (cause) {
      setLogoutError(errorMessage(cause, "Could not sign out."));
    } finally {
      setLogoutBusy(false);
    }
  }

  return (
    <MachineRouteProvider bootstrap={machineBootstrap}>
    <div
      className={
        cinematic
          ? "spares-app spares-app-login spares-app-cinematic min-h-dvh"
          : onLogin
            ? "spares-app spares-app-login min-h-dvh"
            : machineStage
              ? "spares-app spares-app-stage spares-app-machine-context flex min-h-dvh flex-col"
              : machineId
                ? showTabs
                  ? "spares-app spares-app-tabs spares-app-machine-context min-h-dvh"
                  : "spares-app spares-app-machine-context min-h-dvh"
                : showTabs
                ? "spares-app spares-app-tabs min-h-dvh"
                : "spares-app min-h-dvh"
      }
    >
      <header className="spares-header sticky top-0 z-[60] shrink-0 backdrop-blur-md">
        <div className="spares-header-inner mx-auto flex h-14 w-full max-w-none items-center gap-2 px-3 sm:px-4 lg:px-5">
          {machineId ? (
            <>
              <Link
                href="/machines"
                aria-label={`Back to machines, ${machineName ?? "Machine"}`}
                className="inline-flex h-11 min-w-0 flex-1 items-center gap-1 px-2 text-[15px] font-semibold tracking-tight lg:hidden"
              >
                <span aria-hidden="true" className="spares-muted text-lg leading-none">
                  ‹
                </span>
                {machineName ? (
                  <span className="truncate">{machineName}</span>
                ) : (
                  <span className="spares-muted truncate text-sm" aria-hidden="true">
                    …
                  </span>
                )}
              </Link>
              {machineStage ? (
                <div className="hidden min-w-0 items-center gap-1 lg:flex">
                  <Link
                    href="/machines"
                    className="inline-flex h-11 min-w-0 shrink items-center gap-1 px-2 text-[15px] font-semibold tracking-tight"
                  >
                    <span aria-hidden="true" className="spares-muted text-lg leading-none">
                      ‹
                    </span>
                    <span className="truncate">Machines</span>
                  </Link>
                </div>
              ) : (
                <Link
                  href={signedIn ? "/machines" : "/"}
                  className="relative hidden h-11 min-h-11 shrink-0 items-center px-2 before:absolute before:inset-0 before:min-h-11 before:min-w-11 before:content-[''] lg:inline-flex"
                >
                  <BrandMark />
                </Link>
              )}
            </>
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
              <NavLinkWithBadge
                href={user.role === "staff" ? "/staff/notifications" : "/notifications"}
                hrefs={navHrefs}
                label="Notifications"
                unreadCount={lifecycleUnreadCount}
              />
              {user.role === "staff" ? (
                <>
                  <NavLink href="/staff/directory" hrefs={navHrefs}>
                    Directory
                  </NavLink>
                  <NavLink href="/staff/parts" hrefs={navHrefs}>
                    Part lifecycle
                  </NavLink>
                  {ACTIVITY_LOG_ENABLED ? (
                    <NavLink href="/staff/activity" hrefs={navHrefs}>
                      Activity Log
                    </NavLink>
                  ) : null}
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
                    <>
                      <NavLink href="/staff/platform" hrefs={navHrefs}>
                        Platform
                      </NavLink>
                      <NavLinkWithBadge
                        href="/staff/platform/inquiries"
                        hrefs={navHrefs}
                        label="Inquiries"
                        unreadCount={inquiryNewCount}
                      />
                    </>
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
          ) : !signedIn && !resolvingSession && pathname !== "/inquire" ? (
            <nav className="ml-auto flex shrink-0 items-center gap-1" aria-label="Public">
              <Link
                href="/inquire"
                className="spares-muted inline-flex h-11 items-center px-3 text-sm font-medium transition-colors duration-200 hover:text-[var(--spares-ink)]"
              >
                Request access
              </Link>
            </nav>
          ) : (
            <div className="min-w-0 flex-1" />
          )}

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <span
              className="spares-muted hidden select-none text-[11px] font-medium tracking-[0.2em] uppercase sm:inline"
              aria-hidden="true"
            >
              Private
            </span>
            <BugReportControl />
            {signedIn ? (
              <button
                type="button"
                onClick={() => setLogoutConfirmOpen(true)}
                className="spares-muted inline-flex h-11 items-center px-3 text-sm font-medium transition-colors duration-200 hover:text-[var(--spares-ink)]"
              >
                Sign out
              </button>
            ) : resolvingSession || pathname === "/login" ? null : cinematic && pathname !== "/" ? null : (
              <Link
                href="/login"
                className="spares-header-sign-in btn-primary inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold"
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
        {signedIn && machineId ? (
          <div className="spares-header-context mx-auto w-full max-w-none">
            <MachineContextNav
              machineId={machineId}
              machineName={machineName ?? undefined}
              asHeading
            />
          </div>
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
      <ConfirmSheet
        open={logoutConfirmOpen}
        title="Sign out?"
        message="You will need to sign in again on this device. Other open tabs will also lose their session."
        confirmLabel="Sign out"
        cancelLabel="Cancel"
        destructive
        busy={logoutBusy}
        onCancel={() => {
          if (!logoutBusy) {
            setLogoutConfirmOpen(false);
          }
        }}
        onConfirm={() => {
          void handleLogout();
        }}
      />
    </div>
    </MachineRouteProvider>
  );
}
