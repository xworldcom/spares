"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";

export default function Home() {
  const { status, user } = useAuth();
  const signedIn = status === "signed-in" && user;

  return (
    <div className="max-w-lg">
      <p className="spares-muted text-sm font-medium tracking-wide uppercase">
        Private
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Spares</h1>
      <p className="mt-4 text-neutral-700">
        This application is private and is not live.
      </p>
      <p className="mt-2 text-neutral-600">
        Staff upload one machine pack. A logged-in customer opens it, inspects
        the 3D model, clicks a named part, and requests a quote. There is no
        public signup, cart, or checkout.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        {signedIn ? (
          <>
            <Link
              href="/machines"
              className="btn-primary inline-flex h-12 items-center rounded-full px-5 text-[15px] font-semibold"
            >
              Open machines
            </Link>
            <Link
              href={user.role === "staff" ? "/staff/quotes" : "/quotes"}
              className="inline-flex h-12 items-center rounded-full px-5 text-[15px] font-medium text-neutral-800"
            >
              Quotes
            </Link>
            {user.role === "staff" ? (
              <Link
                href="/machines/new"
                className="inline-flex h-12 items-center rounded-full px-5 text-[15px] font-medium text-neutral-800"
              >
                Upload pack
              </Link>
            ) : null}
          </>
        ) : (
          <Link
            href="/login"
            className="btn-primary inline-flex h-12 items-center rounded-full px-5 text-[15px] font-semibold"
          >
            Sign in
          </Link>
        )}
      </div>
    </div>
  );
}
