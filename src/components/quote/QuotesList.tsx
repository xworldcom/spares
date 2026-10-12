"use client";

import Link from "next/link";
import { PrefetchLink } from "@/components/nav/PrefetchLink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CatalogSearch } from "@/components/catalog/CatalogSearch";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useRouter, useSearchParams } from "next/navigation";
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
import type { Quote, QuotesListResponse, Role } from "@/lib/api/types";
import {
  hrefWithQuotesListQuery,
  QUOTES_Q_QUERY,
  QUOTES_STATUS_QUERY,
  quotesStatusFromParam,
  type QuotesStatusFilter,
} from "@/lib/quotes-list-filter";

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
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const listBase = role === "staff" ? "/staff/quotes" : "/quotes";
  const { refresh } = useQuoteAlerts();
  const [quotes, setQuotes] = useState<Quote[]>(initialList?.quotes ?? []);
  const [loading, setLoading] = useState(!initialList);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const statusFilter = quotesStatusFromParam(
    searchParams.get(QUOTES_STATUS_QUERY),
    role === "staff" ? "staff" : "customer",
  );
  const searchQuery = searchParams.get(QUOTES_Q_QUERY) ?? "";
  const [searchDraft, setSearchDraft] = useState(searchQuery);
  const searchFocused = useRef(false);
  const skipNextDebouncedQuery = useRef(false);

  const replaceListQuery = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        const trimmed = value?.trim();
        if (!trimmed) {
          next.delete(key);
        } else {
          next.set(key, trimmed);
        }
      }
      const qs = next.toString();
      router.replace(`${listBase}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [listBase, router, searchParams],
  );
  useEffect(() => {
    if (!searchFocused.current) {
      setSearchDraft(searchQuery);
    }
  }, [searchQuery]);
  const debouncedDraft = useDebouncedValue(searchDraft.trim(), 200);
  useEffect(() => {
    if (skipNextDebouncedQuery.current) {
      skipNextDebouncedQuery.current = false;
      return;
    }
    if (!searchDraft.trim() && !searchQuery.trim()) {
      return;
    }
    if (debouncedDraft === searchQuery.trim()) {
      return;
    }
    replaceListQuery({ [QUOTES_Q_QUERY]: debouncedDraft || undefined });
  }, [debouncedDraft, replaceListQuery, searchDraft, searchQuery]);
  const listSearchQuery =
    searchDraft.trim() !== searchQuery.trim() ? searchDraft.trim() : debouncedDraft;
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
      prefetchAppRoute(
        router,
        hrefWithQuotesListQuery(quoteHref(role, quote), searchParams),
      );
      warmQuoteDetail(quote);
    }
  }, [quotes, role, router, searchParams]);

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
    if (listSearchQuery) {
      const needle = listSearchQuery.toLowerCase();
      rows = rows.filter((quote) => {
        const hay = [
          String(quote.number),
          quote.machineName ?? "",
          quote.customerEmail ?? "",
          quote.note ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(needle);
      });
    }
    return [...rows].sort((a, b) => {
      if (role === "staff" || machineId) {
        return b.number - a.number;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [quotes, machineId, statusFilter, listSearchQuery, role]);

  const statusFilters: Array<{
    value: QuotesStatusFilter;
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
    const searchNoMatch = Boolean(listSearchQuery) && quotes.length > 0;
    const filteredEmpty =
      !machineId && quotes.length > 0 && (statusFilter !== "all" || searchNoMatch);
    return (
      <div className="space-y-3">
        {role === "staff" && !machineId ? (
          <CatalogSearch
            id="staff-quotes-search"
            label="Search quotes"
            value={searchDraft}
            onChange={(value) => {
              setSearchDraft(value);
              if (!value.trim()) {
                skipNextDebouncedQuery.current = true;
                replaceListQuery({ [QUOTES_Q_QUERY]: undefined });
              }
            }}
            onFocus={() => {
              searchFocused.current = true;
            }}
            onBlur={() => {
              searchFocused.current = false;
              if (searchDraft.trim() === searchQuery.trim()) {
                setSearchDraft(searchQuery);
              }
            }}
            placeholder="Quote #, machine, customer…"
          />
        ) : null}
        {!machineId ? (
          <div className="flex flex-wrap gap-1.5">
            {statusFilters.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={statusFilter === option.value}
                onClick={() =>
                  replaceListQuery({
                    [QUOTES_STATUS_QUERY]:
                      option.value === "all" ? undefined : option.value,
                  })
                }
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
              ? searchNoMatch
                ? "Try another search or clear the box."
                : "Try another filter or clear the current one."
              : machineId
                ? "Nothing quoted for this machine yet. Open the model, add parts to the tray, then request a quote."
                : role === "staff"
                  ? "New quotes appear when a plant sends a request."
                  : "Request a quote from a machine to get started."
          }
          action={
            filteredEmpty ? (
              searchNoMatch ? (
                <button
                  type="button"
                  onClick={() => replaceListQuery({ [QUOTES_Q_QUERY]: undefined })}
                  className="btn-primary inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold"
                >
                  Clear search
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => replaceListQuery({ [QUOTES_STATUS_QUERY]: undefined })}
                  className="btn-primary inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold"
                >
                  Clear filters
                </button>
              )
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
      {role === "staff" && !machineId ? (
        <CatalogSearch
          id="staff-quotes-search"
          label="Search quotes"
          value={searchDraft}
          onChange={(value) => {
            setSearchDraft(value);
            if (!value.trim()) {
              skipNextDebouncedQuery.current = true;
              replaceListQuery({ [QUOTES_Q_QUERY]: undefined });
            }
          }}
          onFocus={() => {
            searchFocused.current = true;
          }}
          onBlur={() => {
            searchFocused.current = false;
            if (searchDraft.trim() === searchQuery.trim()) {
              setSearchDraft(searchQuery);
            }
          }}
          placeholder="Quote #, machine, customer…"
        />
      ) : null}
      {!machineId ? (
        <div className="flex flex-wrap gap-1.5">
          {statusFilters.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={statusFilter === option.value}
              onClick={() =>
                replaceListQuery({
                  [QUOTES_STATUS_QUERY]:
                    option.value === "all" ? undefined : option.value,
                })
              }
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
              href={hrefWithQuotesListQuery(quoteHref(role, quote), searchParams)}
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
