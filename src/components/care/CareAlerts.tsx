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
import { listAccessibleTickets } from "@/lib/api/care";
import { TAB_ALERT_POLL_MS } from "@/lib/ui/tab-alert-poll";

type CareAlertsValue = {
  unreadCount: number;
  refresh: () => Promise<void>;
};

const CareAlertsContext = createContext<CareAlertsValue | null>(null);

export function CareAlertsProvider({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    if (status !== "signed-in" || !user) {
      return;
    }
    try {
      const data = await listAccessibleTickets();
      setUnreadCount(data.unreadCount);
    } catch (cause) {
      console.warn("[spares] care alerts refresh failed", cause);
    }
  }, [status, user]);

  useEffect(() => {
    if (status !== "signed-in" || !user) {
      return;
    }
    let cancelled = false;
    listAccessibleTickets()
      .then((data) => {
        if (!cancelled) {
          setUnreadCount(data.unreadCount);
        }
      })
      .catch((cause) => {
        console.warn("[spares] care alerts load failed", cause);
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

  useEffect(() => {
    if (status !== "signed-in" || !user) {
      return;
    }
    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") {
        return;
      }
      void refresh();
    }, TAB_ALERT_POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh, status, user]);

  const visibleCount = status === "signed-in" && user ? unreadCount : 0;
  const value = useMemo(
    () => ({ unreadCount: visibleCount, refresh }),
    [visibleCount, refresh],
  );

  return (
    <CareAlertsContext.Provider value={value}>
      {children}
    </CareAlertsContext.Provider>
  );
}

export function useCareAlerts() {
  const context = useContext(CareAlertsContext);
  if (!context) {
    throw new Error("useCareAlerts must be used within CareAlertsProvider");
  }
  return context;
}
