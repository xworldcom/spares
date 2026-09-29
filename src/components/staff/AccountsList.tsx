"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CatalogSearch } from "@/components/catalog/CatalogSearch";
import { CatalogSkeleton } from "@/components/catalog/CatalogSkeleton";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import {
  createCustomerAccount,
  listCustomerAccounts,
  updateCustomerAccount,
} from "@/lib/api/auth";
import { errorMessage } from "@/lib/api/errors";
import type { CustomerAccount } from "@/lib/api/types";
import { catalogQueryMatch } from "@/lib/ui/catalog-query";

type AccountRow = CustomerAccount & { siteCount: number };

export function AccountsList({ reloadKey = 0 }: { reloadKey?: number }) {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editNames, setEditNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    listCustomerAccounts()
      .then((rows) => {
        if (cancelled) {
          return;
        }
        setAccounts(rows);
        setEditNames(Object.fromEntries(rows.map((row) => [row.id, row.name])));
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
    return accounts.filter((row) =>
      catalogQueryMatch(query, [row.name, String(row.siteCount)]),
    );
  }, [accounts, query]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const account = await createCustomerAccount(newName.trim());
      setAccounts((current) =>
        [...current, account].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setEditNames((current) => ({ ...current, [account.id]: account.name }));
      setNewName("");
      setCreating(false);
    } catch (cause) {
      setError(errorMessage(cause, "Could not create that customer."));
    } finally {
      setSubmitting(false);
    }
  }

  async function saveAccount(id: string) {
    const name = editNames[id]?.trim();
    if (!name) {
      return;
    }
    setSavingId(id);
    setError(null);
    try {
      const account = await updateCustomerAccount(id, name);
      setAccounts((current) =>
        current
          .map((row) => (row.id === id ? { ...row, ...account } : row))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    } catch (cause) {
      setError(errorMessage(cause, "Could not save that customer."));
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <section className="catalog-stack">
        <CatalogSkeleton variant="table" count={4} />
      </section>
    );
  }

  if (error && accounts.length === 0) {
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
          id="account-search"
          label="Search customers"
          value={query}
          onChange={setQuery}
          placeholder="Search customer name"
        />
        <button
          type="button"
          className="btn-primary catalog-toolbar-action"
          aria-expanded={creating}
          onClick={() => setCreating((open) => !open)}
        >
          {creating ? "Close" : "New customer"}
        </button>
      </div>
      {creating ? (
        <form onSubmit={(event) => void handleCreate(event)} className="catalog-create">
          <div className="catalog-create-copy">
            <h2>New customer account</h2>
          </div>
          <div className="catalog-create-grid">
            <label className="block text-sm font-medium md:col-span-2">
              Customer name
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                required
                placeholder="Cargill"
                className="spares-field mt-1.5 h-12 w-full rounded-2xl border-0 px-4 text-[16px] outline-none"
              />
            </label>
          </div>
          <div className="catalog-create-actions">
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary inline-flex h-12 items-center justify-center rounded-full px-5 text-[16px] font-semibold disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Save customer"}
            </button>
          </div>
        </form>
      ) : null}
      {error ? (
        <p className="text-sm text-[#f0c4c0]" role="alert">
          {error}
        </p>
      ) : null}
      {filtered.length === 0 ? (
        <div className="catalog-empty">
          <EmptyState
            title={accounts.length === 0 ? "No customers yet" : "No matches"}
            message={
              accounts.length === 0
                ? "Create a customer account, then add sites and assign people."
                : "Try a different customer name."
            }
          />
        </div>
      ) : (
        <div className="catalog-table-wrap">
          <table className="catalog-table">
            <thead>
              <tr>
                <th scope="col">Customer</th>
                <th scope="col">Sites</th>
                <th scope="col" className="catalog-table-actions">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td>
                    <input
                      value={editNames[row.id] ?? row.name}
                      disabled={savingId === row.id}
                      onChange={(event) =>
                        setEditNames((current) => ({
                          ...current,
                          [row.id]: event.target.value,
                        }))
                      }
                      className="spares-field h-11 w-full max-w-md rounded-2xl border-0 px-3 text-[15px] outline-none"
                      aria-label={`Name for ${row.name}`}
                    />
                  </td>
                  <td>
                    <Link href={`/staff/accounts/${row.id}`} className="catalog-table-link">
                      {row.siteCount} {row.siteCount === 1 ? "site" : "sites"}
                    </Link>
                  </td>
                  <td className="catalog-table-actions">
                    <div className="catalog-table-action-row">
                      <Link href={`/staff/accounts/${row.id}`} className="btn-soft">
                        Manage sites
                      </Link>
                      <button
                        type="button"
                        className="btn-soft"
                        disabled={savingId === row.id}
                        onClick={() => void saveAccount(row.id)}
                      >
                        Save
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="catalog-count">
            {filtered.length} {filtered.length === 1 ? "customer" : "customers"}
          </p>
        </div>
      )}
    </section>
  );
}
