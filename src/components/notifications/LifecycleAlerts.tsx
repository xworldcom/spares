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
import { fetchLifecycleNotifications } from "@/lib/api/lifecycle-notifications";

type LifecycleAlertsValue = {
  unreadCount: number;
  unreadPartNumbers: Set<string>;
  refresh: () => Promise<void>;
};

const LifecycleAlertsContext = createContext<LifecycleAlertsValue | null>(null);

const TAB_ALERT_POLL_MS = 15_000;

export function LifecycleAlertsProvider({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadPartNumbers, setUnreadPartNumbers] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (status !== "signed-in" || !user) {
      return;
    }
    try {
      const data = await fetchLifecycleNotifications();
      setUnreadCount(data.unreadCount);
      setUnreadPartNumbers(
        new Set(
          data.notifications.filter((row) => row.unread).map((row) => row.partNumber),
        ),
      );
    } catch (cause) {
      console.warn("[spares] lifecycle alerts refresh failed", cause);
    }
  }, [status, user]);

  useEffect(() => {
    if (status !== "signed-in" || !user) {
      return;
    }
    void refresh();
  }, [status, user, refresh]);

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
    () => ({ unreadCount: visibleCount, unreadPartNumbers, refresh }),
    [visibleCount, unreadPartNumbers, refresh],
  );

  return (
    <LifecycleAlertsContext.Provider value={value}>
      {children}
    </LifecycleAlertsContext.Provider>
  );
}

export function useLifecycleAlerts() {
  const context = useContext(LifecycleAlertsContext);
  if (!context) {
    throw new Error("useLifecycleAlerts must be used within LifecycleAlertsProvider");
  }
  return context;
}
