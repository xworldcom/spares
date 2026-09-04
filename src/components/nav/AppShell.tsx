"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { BugReportControl } from "@/components/bug-report/BugReportControl";
import { useQuoteAlerts } from "@/components/quote/QuoteAlerts";
import { errorMessage } from "@/lib/api/errors";

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/" && pathname.startsWith(href));
  return (
    <Link
      href={href}
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

function QuotesNavLink({ href, unreadCount }: { href: string; unreadCount: number }) {
  return (
    <span className="relative inline-flex">
      <NavLink href={href}>Quotes</NavLink>
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
  const machineStage = /^\/machines\/[^/]+$/.test(pathname);

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
          ? "spares-app flex min-h-dvh flex-col bg-[#f4f5f7] text-[#0b0d10]"
          : "spares-app min-h-dvh bg-[#f4f5f7] text-[#0b0d10]"
      }
    >
      <header className="sticky top-0 z-[60] shrink-0 bg-[#f4f5f7]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Link href="/" className="px-1 text-[15px] font-semibold tracking-tight">
              Spares
            </Link>
            {status === "signed-in" && user ? (
              <nav className="flex flex-wrap items-center" aria-label="Main">
                <NavLink href="/machines">Machines</NavLink>
                {user.role === "staff" ? (
                  <>
                    <NavLink href="/machines/new">Upload</NavLink>
                    <NavLink href="/staff/customers">Customers</NavLink>
                    <QuotesNavLink href="/staff/quotes" unreadCount={unreadCount} />
                    <NavLink href="/staff/bugs">Bug reports</NavLink>
                  </>
                ) : (
                  <QuotesNavLink href="/quotes" unreadCount={unreadCount} />
                )}
              </nav>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <p className="spares-muted text-[11px] font-medium tracking-[0.14em] uppercase">
              Private
            </p>
            <BugReportControl />
            {status === "signed-in" && user ? (
              <div className="flex items-center gap-2">
                <span className="spares-muted hidden text-sm sm:inline">
                  {user.email}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void handleLogout();
                  }}
                  className="inline-flex h-11 items-center rounded-full px-3.5 text-sm font-medium text-neutral-800 transition-colors duration-200 hover:bg-neutral-200/80"
                >
                  Sign out
                </button>
              </div>
            ) : (
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
            ? "mx-auto flex w-full min-h-0 max-w-7xl flex-1 flex-col px-4 pb-3 pt-2"
            : "mx-auto max-w-6xl px-4 py-8"
        }
      >
        {children}
      </main>
    </div>
  );
}
