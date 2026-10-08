"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { errorMessage, isApiError } from "@/lib/api/errors";
import {
  MICROSOFT_ACCESS_DENIED_CODE,
  MICROSOFT_ACCESS_DENIED_MESSAGE,
} from "@/lib/auth/microsoft-public";
import {
  PASSWORD_LOGIN_DISABLED_CODE,
  PASSWORD_LOGIN_DISABLED_MESSAGE,
  PASSWORD_LOGIN_UNAVAILABLE_MESSAGE,
} from "@/lib/auth/password-login-public";
import { stripCredentialQueryFromLocation } from "@/lib/auth/safe-url";
import { useHydrated } from "@/lib/use-hydrated";

const LOGIN_ACTION = "/api/auth/login";

export function LoginForm({
  nextPath = "/machines",
  microsoftSignInEnabled = false,
  passwordLoginEnabled = true,
  authErrorCode = null,
  deniedTenantId = null,
  signedOut = false,
}: {
  nextPath?: string;
  microsoftSignInEnabled?: boolean;
  passwordLoginEnabled?: boolean;
  authErrorCode?: string | null;
  /** Entra tenant id from a denied Microsoft sign-in, for the person to hand to the host admin. */
  deniedTenantId?: string | null;
  /** Landed here after a 401 — say so instead of a bare form. */
  signedOut?: boolean;
}) {
  const { login, status, user } = useAuth();
  const router = useRouter();
  const hydrated = useHydrated();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    stripCredentialQueryFromLocation();
    if (typeof window === "undefined" || !authErrorCode) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.has("error")) {
      params.delete("error");
      params.delete("tid");
      const nextSearch = params.toString();
      const href = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
      window.history.replaceState(window.history.state, "", href);
    }
  }, [authErrorCode]);

  useEffect(() => {
    if (status === "signed-in" && user) {
      router.replace(nextPath);
    }
  }, [nextPath, router, status, user]);

  async function handleSubmit() {
    const email = emailRef.current?.value.trim() ?? "";
    const password = passwordRef.current?.value ?? "";
    setError(null);
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace(nextPath);
    } catch (cause) {
      if (isApiError(cause) && cause.status === 0) {
        setError("Could not reach the server. Try again.");
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
      noValidate
      className="login-form space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!passwordLoginEnabled || !hydrated || submitting) {
          return;
        }
        void handleSubmit();
      }}
    >
      {signedOut ? (
        <p className="login-signed-out-notice text-sm text-[#e8c27a]" role="status">
          You were signed out. Sign in to continue.
        </p>
      ) : null}
      {!passwordLoginEnabled && !microsoftSignInEnabled ? (
        <p className="text-sm text-[#f0b4b0]" role="alert">
          {PASSWORD_LOGIN_UNAVAILABLE_MESSAGE}
        </p>
      ) : null}
      {passwordLoginEnabled ? (
        <>
          <div>
            <label htmlFor="email" className="login-label block text-[13px] font-medium">
              Email
            </label>
            <input
              ref={emailRef}
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              defaultValue=""
              className="login-input mt-2 h-12 w-full rounded-[0.9rem] border-0 px-4 text-[16px] outline-none"
            />
          </div>
          <div>
            <label htmlFor="password" className="login-label block text-[13px] font-medium">
              Password
            </label>
            <input
              ref={passwordRef}
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              defaultValue=""
              className="login-input mt-2 h-12 w-full rounded-[0.9rem] border-0 px-4 text-[16px] outline-none"
            />
          </div>
        </>
      ) : null}
      {authErrorCode === MICROSOFT_ACCESS_DENIED_CODE ? (
        <p className="text-sm text-[#f0b4b0]" role="alert">
          {MICROSOFT_ACCESS_DENIED_MESSAGE}
          {deniedTenantId ? (
            <>
              <br />
              Your Microsoft tenant ID is <code className="break-all">{deniedTenantId}</code>.
            </>
          ) : null}
        </p>
      ) : null}
      {authErrorCode === PASSWORD_LOGIN_DISABLED_CODE ? (
        <p className="text-sm text-[#f0b4b0]" role="alert">
          {PASSWORD_LOGIN_DISABLED_MESSAGE}
        </p>
      ) : null}
      <div className="login-form-error-slot" aria-live="polite">
        {error ? (
          <p className="text-sm text-[#f0b4b0]" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      {passwordLoginEnabled ? (
        <button
          type="submit"
          disabled={!hydrated || submitting}
          aria-disabled={!hydrated || submitting}
          aria-busy={submitting}
          className="login-submit mt-2 inline-flex h-12 w-full items-center justify-center rounded-full text-[16px] font-semibold disabled:opacity-40"
        >
          {!hydrated ? "Sign in" : submitting ? "Signing in…" : "Sign in"}
        </button>
      ) : null}
      {microsoftSignInEnabled ? (
        <>
          {passwordLoginEnabled ? (
            <p className="login-divider text-center text-[12px] uppercase tracking-[0.14em] text-[rgba(236,234,228,0.45)]">
              or
            </p>
          ) : null}
          <a
            href={`/api/auth/microsoft?next=${encodeURIComponent(nextPath)}`}
            className="login-microsoft inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold"
          >
            <MicrosoftGlyph />
            Sign in with Microsoft
          </a>
        </>
      ) : null}
    </form>
  );
}

function MicrosoftGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
