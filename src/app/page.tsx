"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";

export default function Home() {
  const { status, user } = useAuth();
  const signedIn = status === "signed-in" && user;

  return (
    <div className="max-w-lg">
      <p className="text-sm font-medium tracking-wide text-neutral-500 uppercase">
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
              className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Open machines
            </Link>
            {user.role === "staff" ? (
              <Link
                href="/machines/new"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-white"
              >
                Upload pack
              </Link>
            ) : null}
          </>
        ) : (
          <Link
            href="/login"
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Sign in
          </Link>
        )}
      </div>
    </div>
  );
}
