"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CreatePersonForm } from "@/components/staff/CreatePersonForm";
import { PeopleList } from "@/components/staff/PeopleList";
import { StaffTeamPanel } from "@/components/staff/StaffTeamPanel";
import { AccountsList } from "@/components/staff/AccountsList";
import {
  listCustomerAccounts,
  listCustomers,
  listStaffTeam,
} from "@/lib/api/auth";
import { errorMessage } from "@/lib/api/errors";
import { directoryHref, directoryTypeFromSearchParam } from "@/lib/directory-url";
import type { DirectoryEntryType } from "@/lib/platform-directory";
import { catalogQueryMatch } from "@/lib/ui/catalog-query";
import { displayPersonName } from "@/lib/ui/display-name";

type TypeFilter = DirectoryEntryType | "all";

const TYPE_FILTERS: Array<{ value: TypeFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "customer", label: "Customers" },
  { value: "staff", label: "Staff" },
  { value: "person", label: "People" },
];

type TenantRow =
  | { type: "customer"; id: string; name: string }
  | { type: "staff"; id: string; name: string; email: string }
  | { type: "person"; id: string; name: string; email: string };

export function HostTenantDirectory() {
  const router = useRouter();
  const search = useSearchParams();
  const type = directoryTypeFromSearchParam(search.get("type"));
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(type === "all");
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [creatingPerson, setCreatingPerson] = useState(false);

  const loadUnified = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accounts, people, staff] = await Promise.all([
        listCustomerAccounts(),
        listCustomers(),
        listStaffTeam(),
      ]);
      const next: TenantRow[] = [
        ...accounts.map((row) => ({
          type: "customer" as const,
          id: row.id,
          name: row.name,
        })),
        ...staff.map((row) => ({
          type: "staff" as const,
          id: row.id,
          name: row.email,
          email: row.email,
        })),
        ...people.map((row) => ({
          type: "person" as const,
          id: row.id,
          name: displayPersonName(row),
          email: row.email,
        })),
      ];
      setRows(next.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (cause) {
      setError(errorMessage(cause, "Could not load directory."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (type === "all") {
      void loadUnified();
    }
  }, [type, loadUnified, reloadKey]);

  const visible = useMemo(() => {
    const q = query.trim();
    return rows.filter((row) => {
      if (type !== "all" && row.type !== type) {
        return false;
      }
      if (!q) {
        return true;
      }
      if (row.type === "customer") {
        return catalogQueryMatch(q, [row.name]);
      }
      return catalogQueryMatch(q, [row.name, row.email]);
    });
  }, [rows, type, query]);

  function setType(next: TypeFilter) {
    router.replace(directoryHref(next), { scroll: false });
  }

  function refresh() {
    setReloadKey((key) => key + 1);
  }

  const typeLabel: Record<TenantRow["type"], string> = {
    customer: "Customer",
    staff: "Staff",
    person: "Person",
  };

  return (
    <main className="page-shell">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Directory</h1>
          <p className="text-muted mt-1 max-w-2xl">
            Customer companies, staff logins, and customer people for this install. Open a person
            or staff row to edit profile, access, or deactivate.
          </p>
        </div>
        {type === "person" ? (
          <button
            type="button"
            className="btn-primary text-sm"
            aria-expanded={creatingPerson}
            onClick={() => setCreatingPerson((open) => !open)}
          >
            {creatingPerson ? "Close" : "New person"}
          </button>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Filter by type" className="flex rounded-full bg-white/5 p-1">
          {TYPE_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={type === option.value}
              onClick={() => setType(option.value)}
              className={
                type === option.value
                  ? "rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold"
                  : "rounded-full px-4 py-1.5 text-sm font-medium text-[var(--spares-muted)] hover:text-[var(--spares-ink)]"
              }
            >
              {option.label}
            </button>
          ))}
        </div>
        {type === "all" ? (
          <>
            <label className="sr-only" htmlFor="tenant-directory-search">
              Search directory
            </label>
            <input
              id="tenant-directory-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name or email"
              className="spares-field h-11 w-full max-w-sm rounded-2xl border-0 px-4 text-[15px] outline-none"
            />
          </>
        ) : null}
      </div>

      {type === "person" && creatingPerson ? (
        <CreatePersonForm
          onCreated={() => {
            refresh();
            setCreatingPerson(false);
          }}
          onCancel={() => setCreatingPerson(false)}
        />
      ) : null}

      {type === "customer" ? (
        <AccountsList reloadKey={reloadKey} />
      ) : type === "staff" ? (
        <StaffTeamPanel onCreated={refresh} />
      ) : type === "person" ? (
        <PeopleList reloadKey={reloadKey} />
      ) : loading ? (
        <p className="text-muted">Loading directory…</p>
      ) : error ? (
        <p className="text-danger" role="alert">{error}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-muted">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Type</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={`${row.type}:${row.id}`} className="border-b border-white/5">
                  <td className="py-2.5 pr-4">
                    {row.type === "customer" ? (
                      <Link
                        className="font-medium hover:underline"
                        href={`/staff/accounts/${encodeURIComponent(row.id)}`}
                      >
                        {row.name}
                      </Link>
                    ) : row.type === "person" ? (
                      <Link
                        className="font-medium hover:underline"
                        href={`/staff/directory/${encodeURIComponent(row.id)}`}
                      >
                        {row.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{row.name}</span>
                    )}
                    {row.type !== "customer" ? (
                      <div className="text-xs text-muted">{row.email}</div>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-4 text-muted whitespace-nowrap">
                    {typeLabel[row.type]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 ? (
            <p className="text-muted mt-4">No entries match this filter.</p>
          ) : null}
        </div>
      )}
    </main>
  );
}
