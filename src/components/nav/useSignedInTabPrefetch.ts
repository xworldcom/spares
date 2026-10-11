"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { prefetchLifecycleNotifications } from "@/lib/api/lifecycle-notifications";
import {
  prefetchAppRoute,
  warmCareHubLists,
  warmQuotesList,
  warmStaffHubLists,
  warmTicketsList,
} from "@/lib/nav/prefetch";

const CUSTOMER_TAB_ROUTES = ["/machines", "/care/tickets", "/quotes"] as const;
const STAFF_TAB_ROUTES = [
  "/machines",
  "/care/tickets",
  "/staff/directory",
  "/staff/parts",
  "/staff/quotes",
] as const;

export function useSignedInTabPrefetch(role?: string) {
  const router = useRouter();

  useEffect(() => {
    if (!role) {
      return;
    }
    const routes = role === "staff" ? STAFF_TAB_ROUTES : CUSTOMER_TAB_ROUTES;
    for (const href of routes) {
      prefetchAppRoute(router, href);
    }
    warmCareHubLists();
    warmQuotesList();
    warmTicketsList();
    if (role === "staff") {
      warmStaffHubLists();
    }
    const lifecyclePrefetch = window.setTimeout(() => {
      prefetchLifecycleNotifications();
    }, 2_000);
    return () => {
      window.clearTimeout(lifecyclePrefetch);
    };
  }, [role, router]);
}
