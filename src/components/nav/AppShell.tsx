"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
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
          ? "inline-flex h-11 items-center rounded-full bg-neutral-950 px-3.5 text-sm font-medium text-white"
          : "inline-flex h-11 items-center rounded-full px-3.5 text-sm font-medium text-neutral-600 transition-colors duration-200 hover:bg-neutral-200/70 hover:text-neutral-950"
      }
    >
      {children}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status, user, logout } = useAuth();
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
    <div className="min-h-screen bg-[#f4f5f7] text-[#0b0d10]">
      <header className="bg-[#f4f5f7]/90 backdrop-blur-md">
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
                    <NavLink href="/staff/quotes">Quotes</NavLink>
                    <NavLink href="/staff/bugs">Bug reports</NavLink>
                  </>
                ) : null}
              </nav>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <p className="text-[11px] font-medium tracking-[0.14em] text-neutral-400 uppercase">
              Private
            </p>
            {status === "signed-in" && user ? (
              <div className="flex items-center gap-2">
                <span className="hidden text-sm text-neutral-500 sm:inline">
                  {user.email}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void handleLogout();
                  }}
                  className="inline-flex h-11 items-center rounded-full px-3.5 text-sm font-medium text-neutral-700 transition-colors duration-200 hover:bg-neutral-200/80"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="inline-flex h-11 items-center rounded-full bg-neutral-950 px-4 text-sm font-semibold text-white"
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
            ? "mx-auto max-w-7xl px-4 pb-6 pt-2"
            : "mx-auto max-w-6xl px-4 py-8"
        }
      >
        {children}
      </main>
    </div>
  );
}
