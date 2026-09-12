"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";

export default function Home() {
  const { status, user } = useAuth();
  const signedIn = status === "signed-in" && user;

  return (
    <div className="mx-auto max-w-lg pb-8">
      <p className="spares-muted text-[11px] font-medium tracking-[0.22em] uppercase">
        Private
      </p>
      <h1 className="mt-5 text-[40px] leading-[1.05] font-semibold tracking-tight">
        Spares
      </h1>
      <p className="spares-muted mt-5 text-[16px] leading-relaxed">
        Inspect a machine. Pick a named part. Request a quote. Not live — no
        public signup, cart, or checkout.
      </p>
      <div className="mt-10 flex flex-wrap gap-3">
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
              className="spares-muted inline-flex h-12 items-center px-3 text-[15px] font-medium"
            >
              Quotes
            </Link>
            {user.role === "staff" ? (
              <Link
                href="/machines/new"
                className="spares-muted inline-flex h-12 items-center px-3 text-[15px] font-medium"
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
