"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { listCustomers } from "@/lib/api/auth";
import { errorMessage } from "@/lib/api/errors";
import type { PublicUser } from "@/lib/api/types";

export function CustomersList({ reloadKey = 0 }: { reloadKey?: number }) {
  const [customers, setCustomers] = useState<PublicUser[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listCustomers()
      .then((next) => {
        if (cancelled) {
          return;
        }
        setCustomers(next);
        setError(null);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        setError(errorMessage(cause, "Could not load customers."));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey, retryKey]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return customers;
    }
    return customers.filter((row) => row.email.toLowerCase().includes(needle));
  }, [customers, query]);

  if (loading) {
    return <LoadingState label="Loading customers…" />;
  }

  if (error) {
    return (
      <ErrorState
        title="Failed to load customers"
        message={error}
        onRetry={() => {
          setLoading(true);
          setRetryKey((key) => key + 1);
        }}
      />
    );
  }

  return (
    <section className="space-y-3 rounded-[24px] bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-[19px] font-semibold tracking-tight">Accounts</h2>
        <label className="block min-w-0 flex-1 text-sm font-medium text-neutral-700 sm:max-w-xs">
          Search
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Email"
            className="mt-1.5 h-11 w-full rounded-2xl border-0 bg-[#f4f5f7] px-3 text-[16px] outline-none"
          />
        </label>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title={customers.length === 0 ? "No customers yet" : "No matches"}
          message={
            customers.length === 0
              ? "Create a customer account below. They use the same login screen."
              : "Try a different email."
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[20rem] text-left text-sm">
            <thead>
              <tr className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
                <th className="pb-2 font-medium">Email</th>
                <th className="pb-2 font-medium">Role</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-t border-black/6">
                  <td className="py-3 font-medium text-neutral-950">{row.email}</td>
                  <td className="py-3 text-neutral-600">{row.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
