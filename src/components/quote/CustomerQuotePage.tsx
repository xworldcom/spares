"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { QuoteWorkspace } from "@/components/quote/QuoteWorkspace";
import { LoadingState } from "@/components/states/LoadingState";
import type { Quote } from "@/types";

export function CustomerQuotePage({
  quoteRef,
  initialQuote,
}: {
  quoteRef: string;
  initialQuote?: Quote | null;
}) {
  const router = useRouter();
  const { user, status } = useAuth();

  useEffect(() => {
    if (status !== "signed-in" || user?.role !== "staff") {
      return;
    }
    router.replace(`/staff/quotes/${quoteRef}`);
  }, [quoteRef, router, status, user?.role]);

  if (status === "loading") {
    return <LoadingState label="Loading quote…" />;
  }

  if (user?.role === "staff") {
    return <LoadingState label="Opening staff quote…" />;
  }

  return (
    <QuoteWorkspace
      quoteRef={quoteRef}
      role="customer"
      initialQuote={initialQuote}
    />
  );
}
