"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { stripCredentialQueryFromLocation } from "@/lib/auth/safe-url";
import { useHydrated } from "@/lib/use-hydrated";

const LOGIN_ACTION = "/api/auth/login";

export function LoginForm({ nextPath = "/machines" }: { nextPath?: string }) {
  const { login, status, user } = useAuth();
  const router = useRouter();
  const hydrated = useHydrated();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    stripCredentialQueryFromLocation();
  }, []);

  useEffect(() => {
    if (status === "signed-in" && user) {
      router.replace(nextPath);
    }
  }, [nextPath, router, status, user]);

  async function handleSubmit() {
    const email = emailRef.current?.value.trim() ?? "";
    const password = passwordRef.current?.value ?? "";
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace(nextPath);
    } catch (cause) {
      if (isApiError(cause) && cause.status === 0) {
        setError(
          "Could not reach the login API. T1.2 auth routes may not be on this preview yet.",
        );
      } else {
        setError(errorMessage(cause, "Sign-in failed."));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      method="post"
      action={LOGIN_ACTION}
      autoComplete="on"
      className="login-form space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!hydrated || submitting) {
          return;
        }
        void handleSubmit();
      }}
    >
      <div>
        <label htmlFor="email" className="login-label block text-sm font-medium text-neutral-800">
          Email
        </label>
        <input
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue=""
          className="login-input mt-1.5 h-12 w-full rounded-2xl border-0 bg-white px-4 text-[16px] outline-none ring-1 ring-black/5"
        />
      </div>
      <div>
        <label htmlFor="password" className="login-label block text-sm font-medium text-neutral-800">
          Password
        </label>
        <input
          ref={passwordRef}
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          defaultValue=""
          className="login-input mt-1.5 h-12 w-full rounded-2xl border-0 bg-white px-4 text-[16px] outline-none ring-1 ring-black/5"
        />
      </div>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!hydrated || submitting}
        aria-disabled={!hydrated || submitting}
        className="login-submit btn-primary inline-flex h-12 w-full items-center justify-center rounded-full text-[17px] font-semibold disabled:opacity-40"
      >
        {!hydrated ? "Sign in" : submitting ? "Signing in…" : "Sign in"}
      </button>
      <p className="spares-muted text-xs">
        Staff and customers use the same screen. Accounts are created by staff —
        there is no public signup.
      </p>
    </form>
  );
}
