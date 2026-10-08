"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getMe, login as loginRequest, logout as logoutRequest } from "@/lib/api/auth";
import { ApiError, errorMessage } from "@/lib/api/errors";
import type { PublicUser } from "@/lib/api/types";
import {
  loginHrefForSignedOut,
  onUnauthorized,
  PUBLIC_SIGNED_OUT_PATHS,
} from "@/lib/api/unauthorized";

const REVALIDATE_MIN_MS = 3000;

type AuthStatus = "loading" | "signed-in" | "signed-out" | "unavailable";

type AuthContextValue = {
  status: AuthStatus;
  user: PublicUser | null;
  error: string | null;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<PublicUser>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function initialStatus(initialUser: PublicUser | null | undefined): AuthStatus {
  if (initialUser === undefined) {
    return "loading";
  }
  return initialUser ? "signed-in" : "signed-out";
}

/**
 * `initialUser`: the server already resolved the session cookie for this document request
 * (`null` = confirmed signed out, `undefined` = unknown, ask `/api/auth/me`).
 */
export function AuthProvider({
  children,
  initialUser,
}: {
  children: React.ReactNode;
  initialUser?: PublicUser | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus>(() => initialStatus(initialUser));
  const [user, setUser] = useState<PublicUser | null>(initialUser ?? null);
  const [error, setError] = useState<string | null>(null);
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  const lastCheckRef = useRef(0);

  const applyUser = useCallback((next: PublicUser | null) => {
    setUser(next);
    setError(null);
    setStatus(next ? "signed-in" : "signed-out");
  }, []);

  const applyUnavailable = useCallback((cause: unknown) => {
    setUser(null);
    setError(errorMessage(cause, "Could not check your session."));
    setStatus("unavailable");
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await getMe();
      if (next) {
        applyUser(next);
        return;
      }
      applyUser(null);
    } catch (cause) {
      if (status === "signed-in") {
        return;
      }
      applyUnavailable(cause);
    }
  }, [applyUnavailable, applyUser, status]);

  useEffect(() => {
    if (initialUser !== undefined) {
      return;
    }
    let cancelled = false;
    getMe()
      .then((next) => {
        if (!cancelled) {
          applyUser(next);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          applyUnavailable(cause);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [applyUnavailable, applyUser, initialUser]);

  const sessionLost = useCallback(() => {
    setUser(null);
    setError(null);
    setStatus("signed-out");
    const { pathname, search } = window.location;
    if (PUBLIC_SIGNED_OUT_PATHS.has(pathname)) {
      return;
    }
    router.replace(loginHrefForSignedOut(`${pathname}${search}`));
  }, [router]);

  const verifySession = useCallback(
    async (force = false) => {
      if (statusRef.current !== "signed-in") {
        return;
      }
      const now = Date.now();
      if (!force && now - lastCheckRef.current < REVALIDATE_MIN_MS) {
        return;
      }
      lastCheckRef.current = now;
      try {
        const next = await getMe();
        if (!next) {
          sessionLost();
        }
      } catch {
        // Offline or server blip: keep the current screen.
      }
    },
    [sessionLost],
  );

  useEffect(() => {
    // Any API 401 means the cookie is gone or revoked (e.g. signed out on another device).
    // Confirm with /me so a stale in-flight request cannot sign out a fresh login.
    const stop = onUnauthorized(() => {
      void verifySession(true);
    });
    function onVisible() {
      if (document.visibilityState === "visible") {
        void verifySession();
      }
    }
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        void verifySession(true);
      }
    }
    function onFocus() {
      void verifySession();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
    };
  }, [verifySession]);

  const login = useCallback(async (email: string, password: string) => {
    const next = await loginRequest(email, password);
    setUser(next);
    setError(null);
    setStatus("signed-in");
    return next;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch (cause) {
      if (!(cause instanceof ApiError && cause.status === 404)) {
        throw cause;
      }
    }
    setUser(null);
    setError(null);
    setStatus("signed-out");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, error, refresh, login, logout }),
    [status, user, error, refresh, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
