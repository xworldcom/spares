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
          ? "rounded-md bg-neutral-900 px-2.5 py-1 text-sm font-medium text-white"
          : "rounded-md px-2.5 py-1 text-sm text-neutral-700 hover:bg-neutral-200"
      }
    >
      {children}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status, user, logout } = useAuth();
  const router = useRouter();
  const [logoutError, setLogoutError] = useState<string | null>(null);

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
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              Spares
            </Link>
            {status === "signed-in" && user ? (
              <nav className="flex flex-wrap items-center gap-1" aria-label="Main">
                <NavLink href="/machines">Machines</NavLink>
                {user.role === "staff" ? (
                  <>
                    <NavLink href="/machines/new">Upload pack</NavLink>
                    <NavLink href="/staff/customers">Customers</NavLink>
                    <NavLink href="/staff/quotes">Quotes</NavLink>
                    <NavLink href="/staff/bugs">Bug reports</NavLink>
                  </>
                ) : null}
              </nav>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
              Private · not live
            </p>
            {status === "signed-in" && user ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-600">
                  {user.email}
                  <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700 capitalize">
                    {user.role}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void handleLogout();
                  }}
                  className="rounded-md border border-neutral-300 px-2.5 py-1 text-sm text-neutral-800 hover:bg-neutral-100"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="rounded-md bg-neutral-900 px-2.5 py-1 text-sm font-medium text-white hover:bg-neutral-800"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
        {logoutError ? (
          <p className="border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800" role="alert">
            {logoutError}
          </p>
        ) : null}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
