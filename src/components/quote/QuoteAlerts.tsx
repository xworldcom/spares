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
import { listQuotes } from "@/lib/api/quotes";

type QuoteAlertsValue = {
  unreadCount: number;
  refresh: () => Promise<void>;
};

const QuoteAlertsContext = createContext<QuoteAlertsValue | null>(null);

export function QuoteAlertsProvider({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    if (status !== "signed-in" || !user) {
      return;
    }
    try {
      const data = await listQuotes();
      setUnreadCount(data.unreadCount);
    } catch {
      // Preview: leave the last known count if the list fails.
    }
  }, [status, user]);

  useEffect(() => {
    if (status !== "signed-in" || !user) {
      return;
    }
    let cancelled = false;
    listQuotes()
      .then((data) => {
        if (!cancelled) {
          setUnreadCount(data.unreadCount);
        }
      })
      .catch(() => {
        // Preview: leave the last known count if the list fails.
      });
    return () => {
      cancelled = true;
    };
  }, [status, user]);

  useEffect(() => {
    function onFocus() {
      void refresh();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

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
