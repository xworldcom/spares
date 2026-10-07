"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { prefetchAppRoute, warmCareHubLists, warmQuotesList } from "@/lib/nav/prefetch";

const CUSTOMER_TAB_ROUTES = ["/machines", "/care", "/quotes"] as const;
const STAFF_TAB_ROUTES = [
  "/machines",
  "/care",
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
  }, [role, router]);
}
