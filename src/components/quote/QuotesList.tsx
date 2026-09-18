"use client";

import Link from "next/link";
import { PrefetchLink } from "@/components/nav/PrefetchLink";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { useAuth } from "@/components/auth/AuthProvider";
import { QuoteStatusChip } from "@/components/quote/QuoteStatusChip";
import { formatDay } from "@/components/quote/quote-format";
import { useQuoteAlerts } from "@/components/quote/QuoteAlerts";
import { errorMessage } from "@/lib/api/errors";
import { listQuotes } from "@/lib/api/quotes";
import { quoteHref } from "@/lib/quotes";
import { warmQuoteDetail } from "@/lib/nav/prefetch";
import type { Quote, Role } from "@/lib/api/types";

export function QuotesList({ role }: { role: Role }) {
  const { user } = useAuth();
  const { refresh } = useQuoteAlerts();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listQuotes()
      .then((data) => {
        if (cancelled) {
          return;
        }
        setQuotes(data.quotes);
        setError(null);
        setLoading(false);
        void refresh();
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        setError(errorMessage(cause, "Could not load quotes."));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey, refresh]);

  if (loading) {
    return <LoadingState label="Loading quotes…" />;
  }

  if (error) {
    return (
      <ErrorState
        title="Failed to load quotes"
        message={error}
        onRetry={() => {
          setLoading(true);
          setReloadKey((key) => key + 1);
        }}
      />
    );
  }

  if (quotes.length === 0) {
    return (
      <EmptyState
        title={role === "staff" ? "No quotes yet" : "No quotes yet"}
        message={
          role === "staff"
            ? "When a customer requests a quote, it will show up here."
            : "Open a machine, add parts to the tray, and request a quote."
        }
        action={
          user?.role === "customer" ? (
            <Link
              href="/machines"
              className="btn-primary inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold"
            >
              Open machines
            </Link>
          ) : null
        }
      />
    );
  }

  return (
    <ul className="spares-surface divide-y divide-white/8 overflow-hidden rounded-[24px]">
      {quotes.map((quote) => {
        const lines = quote.items.length;
        const title = quote.machineName ?? "Machine";
        return (
          <li key={quote.id}>
            <PrefetchLink
              href={quoteHref(role, quote)}
              warm={() => warmQuoteDetail(quote.id)}
              className="flex min-h-16 items-start gap-3 px-4 py-3.5 hover:bg-white/4 sm:items-center"
            >
              {quote.unread ? (
                <span
                  className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-[#0a84ff] sm:mt-0.5"
                  aria-label="Unread"
                />
              ) : (
                <span className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-medium tracking-tight">
                  Quote {quote.number}
                  <span className="spares-muted font-normal"> · {title}</span>
                </p>
                <p className="spares-muted mt-0.5 truncate text-sm">
                  {formatDay(quote.createdAt)}
                  {role === "staff" ? ` · ${quote.customerEmail}` : ""}
                  {` · ${lines} ${lines === 1 ? "line" : "lines"}`}
                </p>
                <div className="mt-2 sm:hidden">
                  <QuoteStatusChip status={quote.status} current />
                </div>
              </div>
              <span className="hidden shrink-0 sm:inline-flex">
                <QuoteStatusChip status={quote.status} current />
              </span>
              <span className="spares-muted hidden text-lg sm:inline" aria-hidden="true">
                ›
              </span>
            </PrefetchLink>
          </li>
        );
      })}
    </ul>
  );
}
