"use client";

import { useEffect, useMemo, useState } from "react";
import { CatalogSearch } from "@/components/catalog/CatalogSearch";
import { CatalogSkeleton } from "@/components/catalog/CatalogSkeleton";
import { PersonGlyph } from "@/components/catalog/CatalogGlyph";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { accessLabel, accessOptions, accessValue, parseAccessValue, siteLabel } from "@/lib/access";
import {
  listCustomers,
  listSites,
  updateCustomerSites,
} from "@/lib/api/auth";
import { errorMessage } from "@/lib/api/errors";
import type { PublicUser, Site } from "@/lib/api/types";
import { catalogQueryMatch } from "@/lib/ui/catalog-query";
import { displayNameFromEmail } from "@/lib/ui/display-name";

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
    return customers.filter((row) =>
      catalogQueryMatch(query, [
        displayNameFromEmail(row.email),
        row.email,
        accessLabel(row),
        ...(row.sites ?? []).map((site) => siteLabel(site)),
        ...(row.companyAccess ?? []),
      ]),
    );
  }, [customers, query]);

  async function onAssign(userId: string, value: string) {
    setSavingId(userId);
    try {
      const next = await updateCustomerSites(userId, parseAccessValue(value));
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
    return (
      <section className="catalog-stack">
        <p className="sr-only" aria-live="polite">
          Loading customers…
        </p>
        <CatalogSkeleton variant="person" count={5} />
      </section>
    );
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
    <section className="catalog-stack">
      <div className="catalog-toolbar">
        <CatalogSearch
          id="customer-search"
          label="Search customers"
          value={query}
          onChange={setQuery}
          placeholder="Search name, email, or plant"
        />
        <p className="catalog-count">
          {filtered.length} {filtered.length === 1 ? "account" : "accounts"}
        </p>
      </div>
      {error ? (
        <p className="text-sm text-[#f0c4c0]" role="alert">
          {error}
        </p>
      ) : null}
      {filtered.length === 0 ? (
        <div className="catalog-empty">
          <EmptyState
            title={customers.length === 0 ? "No customers yet" : "No matches"}
            message={
              customers.length === 0
                ? "Create a customer with New customer. They use the same login screen."
                : "Try a different name, email, or plant."
            }
          />
        </div>
      ) : (
        <ul className="catalog-people-list">
          <li className="catalog-people-head" aria-hidden="true">
            <span>Customer</span>
            <span>Contact</span>
            <span>Plants</span>
            <span>Access</span>
          </li>
          {filtered.map((row) => {
            const current = accessValue(row);
            const name = displayNameFromEmail(row.email);
            const plants = accessLabel(row) || "No access";
            return (
              <li key={row.id} className="catalog-person-card">
                <div className="catalog-person-who">
                  <PersonGlyph email={row.email} />
                  <div className="min-w-0">
                    <p className="catalog-person-name">{name}</p>
                    <p className="catalog-person-email catalog-person-email-mobile">{row.email}</p>
                    <p className="catalog-person-plant-mobile">{plants}</p>
                  </div>
                </div>
                <p className="catalog-person-email catalog-person-email-desktop">{row.email}</p>
                <p className="catalog-person-plant-desktop">{plants}</p>
                <label className="catalog-person-access">
                  <span className="sr-only">Access for {row.email}</span>
                  <select
                    value={current}
                    disabled={savingId === row.id}
                    onChange={(event) => {
                      void onAssign(row.id, event.target.value);
                    }}
                    className="spares-field h-11 w-full rounded-2xl border-0 px-3 text-[15px] outline-none"
                    aria-label={`Plant for ${row.email}`}
                  >
                    <option value="">No access — hidden from models</option>
                    {accessOptions(sites).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
