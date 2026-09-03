"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { errorMessage } from "@/lib/api/errors";
import { listQuotes } from "@/lib/api/quotes";
import type { Quote } from "@/lib/api/types";

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function QuotesInbox() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listQuotes()
      .then((next) => {
        if (cancelled) {
          return;
        }
        setQuotes(next);
        setError(null);
        setLoading(false);
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
  }, [reloadKey]);

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
        title="No quote requests"
        message="When a customer picks a part and requests a quote, it will appear here."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-neutral-100 text-xs tracking-wide text-neutral-600 uppercase">
          <tr>
            <th className="px-3 py-2 font-medium">When</th>
            <th className="px-3 py-2 font-medium">Customer</th>
            <th className="px-3 py-2 font-medium">Machine</th>
            <th className="px-3 py-2 font-medium">Part numbers</th>
            <th className="px-3 py-2 font-medium">Note</th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((quote) => (
            <tr key={quote.id} className="border-t border-neutral-200">
              <td className="px-3 py-2 whitespace-nowrap text-neutral-700">
                {formatWhen(quote.createdAt)}
              </td>
              <td className="px-3 py-2">{quote.customerEmail}</td>
              <td className="px-3 py-2 font-mono text-xs">{quote.machineId}</td>
              <td className="px-3 py-2 font-mono text-xs">
                {quote.partIds.join(", ")}
              </td>
              <td className="px-3 py-2 text-neutral-600">{quote.note ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
