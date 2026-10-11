"use client";

import Link from "next/link";
import { PrefetchLink } from "@/components/nav/PrefetchLink";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { CatalogSkeleton } from "@/components/catalog/CatalogSkeleton";
import { useAuth } from "@/components/auth/AuthProvider";
import { QuoteStatusChip } from "@/components/quote/QuoteStatusChip";
import { formatDay } from "@/components/quote/quote-format";
import { useQuoteAlerts } from "@/components/quote/QuoteAlerts";
import { errorMessage } from "@/lib/api/errors";
import { listQuotes } from "@/lib/api/quotes";
import {
  formatMoney,
  pricesVisibleToCustomer,
  quoteHref,
  quoteSellTotal,
} from "@/lib/quotes";
import { rememberQuotesForNav } from "@/lib/nav/quote-list-seed";
import { prefetchAppRoute, warmQuoteDetail } from "@/lib/nav/prefetch";
import { useRequestGeneration } from "@/lib/ui/request-generation";
import type { Quote, QuoteStatus, QuotesListResponse, Role } from "@/lib/api/types";

export function QuotesList({
  role,
  machineId,
  initialList,
}: {
  role: Role;
  machineId?: string;
  initialList?: QuotesListResponse | null;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const { refresh } = useQuoteAlerts();
  const [quotes, setQuotes] = useState<Quote[]>(initialList?.quotes ?? []);
  const [loading, setLoading] = useState(!initialList);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState<
    QuoteStatus | "all" | "in_review" | "closed_group"
  >("all");
  const { begin, isCurrent } = useRequestGeneration();

  useEffect(() => {
    const generation = begin();
    const skipListFetch = Boolean(initialList) && reloadKey === 0;
    const background = reloadKey > 0;
    if (!skipListFetch && !background) {
      setLoading(true);
    }
    const load = skipListFetch
      ? Promise.resolve({ quotes: initialList?.quotes ?? [] })
      : listQuotes({ background });
    load
      .then((data) => {
        if (!isCurrent(generation)) {
          return;
        }
        setQuotes(data.quotes);
        setError(null);
        void refresh();
      })
      .catch((cause: unknown) => {
        if (!isCurrent(generation)) {
          return;
        }
        setError(errorMessage(cause, "Could not load quotes."));
      })
      .finally(() => {
        if (isCurrent(generation)) {
          setLoading(false);
        }
      });
  }, [begin, initialList, isCurrent, reloadKey, refresh]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") {
        setReloadKey((key) => key + 1);
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (quotes.length === 0) {
      return;
    }
    rememberQuotesForNav(quotes);
    for (const quote of quotes.slice(0, 6)) {
      prefetchAppRoute(router, quoteHref(role, quote));
      warmQuoteDetail(quote);
    }
  }, [quotes, role, router]);

  const visible = useMemo(() => {
    let rows = machineId
      ? quotes.filter((quote) => quote.machineId === machineId)
      : quotes;
    if (statusFilter === "in_review") {
      rows = rows.filter((quote) => quote.status === "in_review");
    } else if (statusFilter === "closed_group") {
      rows = rows.filter(
        (quote) => quote.status === "closed" || quote.status === "cancelled",
      );
    } else if (statusFilter !== "all") {
      rows = rows.filter((quote) => quote.status === statusFilter);
    }
    return [...rows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [quotes, machineId, statusFilter]);

  const statusFilters: Array<{
    value: QuoteStatus | "all" | "in_review" | "closed_group";
    label: string;
  }> =
    role === "staff"
      ? [
          { value: "all", label: "All" },
          { value: "in_review", label: "In review" },
          { value: "closed_group", label: "Closed" },
        ]
      : [
          { value: "all", label: "All" },
          { value: "requested", label: "Requested" },
          { value: "pricing", label: "Pricing" },
          { value: "quoted", label: "Quoted" },
          { value: "ordered", label: "Ordered" },
          { value: "shipped", label: "Shipped" },
          { value: "delivered", label: "Delivered" },
          { value: "cancelled", label: "Cancelled" },
        ];

  if (loading) {
    return (
      <div className="px-1 py-2" aria-busy="true" aria-label="Loading quotes">
        <CatalogSkeleton variant="table" count={4} />
      </div>
    );
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

  if (visible.length === 0) {
    const filteredEmpty =
      !machineId && quotes.length > 0 && statusFilter !== "all";
    return (
      <div className="space-y-3">
        {!machineId ? (
          <div className="flex flex-wrap gap-1.5">
            {statusFilters.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={statusFilter === option.value}
                onClick={() => setStatusFilter(option.value)}
                className={`inline-flex h-9 items-center rounded-full px-3 text-[13px] font-medium ${
                  statusFilter === option.value ? "btn-primary" : "btn-soft"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
        <EmptyState
          title={filteredEmpty ? "No quotes match" : "No quotes yet"}
          message={
            filteredEmpty
              ? "Try another filter or clear the current one."
              : machineId
                ? "Nothing quoted for this machine yet. Open the model, add parts to the tray, then request a quote."
                : role === "staff"
                  ? "New quotes appear when a plant sends a request."
                  : "Request a quote from a machine to get started."
          }
          action={
            filteredEmpty ? (
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className="btn-primary inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold"
              >
                Clear filters
              </button>
            ) : user?.role === "customer" && !machineId ? (
              <Link
                href="/machines"
                className="btn-primary inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold"
              >
                Open machines
              </Link>
            ) : null
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!machineId ? (
        <div className="flex flex-wrap gap-1.5">
          {statusFilters.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={statusFilter === option.value}
              onClick={() => setStatusFilter(option.value)}
              className={`inline-flex h-9 items-center rounded-full px-3 text-[13px] font-medium ${
                statusFilter === option.value ? "btn-primary" : "btn-soft"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    <ul className="spares-surface divide-y divide-white/8 overflow-hidden rounded-[24px]">
      {visible.map((quote) => {
        const lines = quote.lineCount ?? quote.items.length;
        const title = quote.machineName ?? "Machine";
        const showTotal =
          role === "customer" && pricesVisibleToCustomer(quote.status);
        const total = showTotal
          ? (quote.listSellTotal ?? quoteSellTotal(quote.items) ?? 0)
          : 0;
        return (
          <li key={quote.id}>
            <PrefetchLink
              href={quoteHref(role, quote)}
              warm={() => warmQuoteDetail(quote)}
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
                  {machineId ? null : (
                    <span className="spares-muted font-normal"> · {title}</span>
                  )}
                </p>
                <p className="spares-muted mt-0.5 truncate text-sm">
                  {formatDay(quote.createdAt)}
                  {role === "staff" ? ` · ${quote.customerEmail}` : ""}
                  {` · ${lines} ${lines === 1 ? "line" : "lines"}`}
                  {showTotal && total > 0 ? ` · ${formatMoney(total)}` : ""}
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
    </div>
  );
}
