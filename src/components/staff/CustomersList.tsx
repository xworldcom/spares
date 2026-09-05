"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { siteLabel } from "@/lib/access";
import {
  listCustomers,
  listSites,
  updateCustomerSites,
} from "@/lib/api/auth";
import { errorMessage } from "@/lib/api/errors";
import type { PublicUser, Site } from "@/lib/api/types";

export function CustomersList({ reloadKey = 0 }: { reloadKey?: number }) {
  const [customers, setCustomers] = useState<PublicUser[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listCustomers(), listSites()])
      .then(([nextCustomers, nextSites]) => {
        if (cancelled) {
          return;
        }
        setCustomers(nextCustomers);
        setSites(nextSites);
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
    return customers.filter((row) => {
      const hay = [
        row.email,
        ...(row.sites ?? []).map((site) => siteLabel(site)),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [customers, query]);

  async function onAssign(userId: string, siteId: string) {
    setSavingId(userId);
    try {
      const next = await updateCustomerSites(userId, siteId ? [siteId] : []);
      setCustomers((current) =>
        current.map((row) => (row.id === userId ? next : row)),
      );
    } catch (cause) {
      setError(errorMessage(cause, "Could not update that plant."));
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return <LoadingState label="Loading customers…" />;
  }

  if (error && customers.length === 0) {
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
            placeholder="Email or plant"
            className="mt-1.5 h-11 w-full rounded-2xl border-0 bg-[#f4f5f7] px-3 text-[16px] outline-none"
          />
        </label>
      </div>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {filtered.length === 0 ? (
        <EmptyState
          title={customers.length === 0 ? "No customers yet" : "No matches"}
          message={
            customers.length === 0
              ? "Create a customer account below. They use the same login screen."
              : "Try a different email or plant."
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead>
              <tr className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
                <th className="pb-2 font-medium">Email</th>
                <th className="pb-2 font-medium">Plant</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const current = row.siteIds?.[0] ?? "";
                return (
                  <tr key={row.id} className="border-t border-black/6">
                    <td className="py-3 font-medium text-neutral-950">
                      {row.email}
                    </td>
                    <td className="py-3">
                      <select
                        value={current}
                        disabled={savingId === row.id}
                        onChange={(event) => {
                          void onAssign(row.id, event.target.value);
                        }}
                        className="h-11 w-full max-w-xs rounded-2xl border-0 bg-[#f4f5f7] px-3 text-[15px] outline-none"
                        aria-label={`Plant for ${row.email}`}
                      >
                        <option value="">No plant — hidden from models</option>
                        {sites.map((site) => (
                          <option key={site.id} value={site.id}>
                            {siteLabel(site)}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
