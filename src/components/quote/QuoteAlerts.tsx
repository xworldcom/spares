"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  fetchQuoteAlertsUnreadCount,
  scheduleQuoteAlertsInitialLoad,
} from "@/components/quote/quote-alerts-fetch";

type QuoteAlertsValue = {
  unreadCount: number;
  refresh: () => Promise<void>;
};

const QuoteAlertsContext = createContext<QuoteAlertsValue | null>(null);

/** Keep tab badges current while the user stays on another page (no window blur). */
const TAB_ALERT_POLL_MS = 15_000;

export function QuoteAlertsProvider({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    if (status !== "signed-in" || !user) {
      return;
    }
    try {
      const unreadCount = await fetchQuoteAlertsUnreadCount();
      setUnreadCount(unreadCount);
    } catch (cause) {
      console.warn("[spares] quote alerts refresh failed", cause);
    }
  }, [status, user]);

  useEffect(() => {
    if (status !== "signed-in" || !user) {
      return;
    }
    let cancelled = false;
    const clearSchedule = scheduleQuoteAlertsInitialLoad(async () => {
      try {
        const unreadCount = await fetchQuoteAlertsUnreadCount();
        if (!cancelled) {
          setUnreadCount(unreadCount);
        }
      } catch (cause) {
        console.warn("[spares] quote alerts load failed", cause);
      }
    });
    return () => {
      cancelled = true;
      clearSchedule();
    };
  }, [status, user]);

  useEffect(() => {
    function onFocus() {
      void refresh();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  useEffect(() => {
    if (status !== "signed-in" || !user) {
      return;
    }
    const id = window.setInterval(() => void refresh(), TAB_ALERT_POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh, status, user]);

  const visibleCount = status === "signed-in" && user ? unreadCount : 0;
  const value = useMemo(
    () => ({ unreadCount: visibleCount, refresh }),
    [visibleCount, refresh],
  );

  return (
    <QuoteAlertsContext.Provider value={value}>
      {children}
    </QuoteAlertsContext.Provider>
  );
}

export function useQuoteAlerts() {
  const context = useContext(QuoteAlertsContext);
  if (!context) {
    throw new Error("useQuoteAlerts must be used within QuoteAlertsProvider");
  }
  return context;
}
