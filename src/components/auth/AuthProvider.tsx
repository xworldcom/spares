"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getMe, login as loginRequest, logout as logoutRequest } from "@/lib/api/auth";
import { ApiError, errorMessage } from "@/lib/api/errors";
import type { PublicUser } from "@/lib/api/types";

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  }, [applyUnavailable, applyUser]);

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
