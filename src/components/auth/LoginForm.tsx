"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { errorMessage, isApiError } from "@/lib/api/errors";

export function LoginForm({ nextPath = "/machines" }: { nextPath?: string }) {
  const { login, status, user } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "signed-in" && user) {
      router.replace(nextPath);
    }
  }, [nextPath, router, status, user]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
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
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="space-y-4"
    >
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-neutral-800">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1.5 h-12 w-full rounded-2xl border-0 bg-white px-4 text-[15px] outline-none ring-1 ring-black/5"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-neutral-800">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1.5 h-12 w-full rounded-2xl border-0 bg-white px-4 text-[15px] outline-none ring-1 ring-black/5"
        />
      </div>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-12 w-full items-center justify-center rounded-full bg-neutral-950 text-[17px] font-semibold text-white disabled:opacity-40"
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-xs text-neutral-500">
        Staff and customers use the same screen. Accounts are created by staff —
        there is no public signup.
      </p>
    </form>
  );
}
