"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { CreatePersonForm } from "@/components/staff/CreatePersonForm";
import { HostTenantDirectory } from "@/components/staff/HostTenantDirectory";
import { StaffTeamPanel } from "@/components/staff/StaffTeamPanel";
import { apiFetch } from "@/lib/api/client";
import { createCustomerAccount } from "@/lib/api/auth";
import { errorMessage, isForbidden } from "@/lib/api/errors";
import { directoryHref, directoryTypeFromSearchParam } from "@/lib/directory-url";
import {
  filterDirectoryEntries,
  type DirectoryEntry,
  type DirectoryEntryType,
} from "@/lib/platform-directory";

type DirectoryResponse = { entries: DirectoryEntry[] };

type TypeFilter = DirectoryEntryType | "all";

type SortKey = "name" | "type" | "host";

const TYPE_FILTERS: Array<{ value: TypeFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "host", label: "Hosts" },
  { value: "staff", label: "Staff" },
  { value: "customer", label: "Customers" },
  { value: "person", label: "People" },
];

const TYPE_LABELS: Record<DirectoryEntryType, string> = {
  host: "Host",
  customer: "Customer",
  staff: "Staff",
  person: "Person",
};

const TYPE_ORDER: Record<DirectoryEntryType, number> = {
  host: 0,
  staff: 1,
  customer: 2,
  person: 3,
};

const DIRECTORY_CREATE_CHIP =
  "btn-soft inline-flex h-11 shrink-0 items-center rounded-full px-4 text-sm font-medium";

function directoryEntryHref(entry: DirectoryEntry): string | null {
  switch (entry.type) {
    case "host":
      return `/staff/platform/${encodeURIComponent(entry.id)}`;
    case "customer":
      return `/staff/accounts/${encodeURIComponent(entry.id)}`;
    case "staff":
    case "person":
      return `/staff/directory/${encodeURIComponent(entry.id)}`;
    default:
      return null;
  }
}

function sortValue(entry: DirectoryEntry, key: SortKey): string | number {
  switch (key) {
    case "name":
      return entry.name.toLowerCase();
    case "type":
      return TYPE_ORDER[entry.type];
    case "host":
      return entry.hostName.toLowerCase();
  }
}

export default function StaffDirectoryPage() {
  return (
    <RequireAuth role="staff">
      <Suspense>
        <StaffDirectory />
      </Suspense>
    </RequireAuth>
  );
}

function StaffDirectory() {
  const { user } = useAuth();
  if (user?.platformOwner) {
    return <PlatformDirectory />;
  }
  return <HostTenantDirectory />;
}

function PlatformDirectory() {
  const router = useRouter();
  const search = useSearchParams();
  const initialHost = search.get("host") ?? "";
  const type = directoryTypeFromSearchParam(search.get("type"));
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(initialHost);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [groupByHost, setGroupByHost] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [creatingPerson, setCreatingPerson] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [creatingStaff, setCreatingStaff] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [creatingCustomerSubmitting, setCreatingCustomerSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<DirectoryResponse>("/api/platform/directory");
      setEntries(data.entries);
      setForbidden(false);
      setError(null);
    } catch (cause) {
      if (isForbidden(cause)) {
        setForbidden(true);
      } else {
        setError(errorMessage(cause, "Could not load the directory"));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  useEffect(() => {
    setCreatingPerson(false);
    setCreatingCustomer(false);
    setCreatingStaff(false);
  }, [type]);

  function setType(next: TypeFilter) {
    router.replace(directoryHref(next), { scroll: false });
  }

  function refresh() {
    setReloadKey((key) => key + 1);
  }

  const visible = useMemo(() => {
    const filtered = filterDirectoryEntries(entries, { type, query });
    const direction = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const left = sortValue(a, sortKey);
      const right = sortValue(b, sortKey);
      if (left < right) {
        return -direction;
      }
      if (left > right) {
        return direction;
      }
      return a.name.localeCompare(b.name);
    });
  }, [entries, type, query, sortKey, sortDir]);

  const grouped = useMemo(() => {
    if (!groupByHost || type === "staff" || type === "person" || type === "customer") {
      return null;
    }
    const groups = new Map<string, { hostName: string; rows: DirectoryEntry[] }>();
    for (const entry of visible) {
      const group = groups.get(entry.hostId) ?? { hostName: entry.hostName, rows: [] };
      group.rows.push(entry);
      groups.set(entry.hostId, group);
    }
    return [...groups.entries()].sort((a, b) =>
      a[1].hostName.localeCompare(b[1].hostName),
    );
  }, [groupByHost, visible, type]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  async function handleCreateCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingCustomerSubmitting(true);
    setError(null);
    try {
      await createCustomerAccount(newCustomerName.trim());
      setNewCustomerName("");
      setCreatingCustomer(false);
      refresh();
    } catch (cause) {
      setError(errorMessage(cause, "Could not create that customer."));
    } finally {
      setCreatingCustomerSubmitting(false);
    }
  }

  if (forbidden) {
    return (
      <main className="page-shell">
        <h1 className="page-title">Directory</h1>
        <p className="text-muted">Platform owner access is required.</p>
      </main>
    );
  }

  const columns: Array<{ key: SortKey; label: string }> = [
    { key: "name", label: "Name" },
    { key: "type", label: "Type" },
    { key: "host", label: "Host" },
  ];

  function renderRows(rows: DirectoryEntry[], includeHostColumn: boolean) {
    return rows.map((entry) => {
      const href = directoryEntryHref(entry);
      return (
        <tr
          key={`${entry.type}:${entry.id}`}
          className="border-b border-white/5 cursor-pointer hover:bg-white/[0.03]"
          onClick={() => {
            if (href) {
              router.push(href);
            }
          }}
          onKeyDown={(event) => {
            if (!href) {
              return;
            }
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              router.push(href);
            }
          }}
          tabIndex={href ? 0 : undefined}
          role={href ? "link" : undefined}
        >
          <td className="py-2.5 pr-4">
            <span className="font-medium">{entry.name}</span>
            {entry.email && entry.email !== entry.name ? (
              <div className="text-xs text-muted">{entry.email}</div>
            ) : null}
          </td>
          <td className="py-2.5 pr-4 text-muted whitespace-nowrap">
            {TYPE_LABELS[entry.type]}
            {entry.type === "host" && entry.suspended ? (
              <span className="ml-2 text-xs text-amber-400/90">Suspended</span>
            ) : null}
          </td>
          {includeHostColumn ? (
            <td
              className="py-2.5 pr-4 whitespace-nowrap"
              onClick={(event) => event.stopPropagation()}
            >
              {entry.type === "host" ? (
                <span className="text-muted">{entry.hostName}</span>
              ) : (
                <Link
                  className="text-muted hover:underline"
                  href={`/staff/platform/${encodeURIComponent(entry.hostId)}`}
                >
                  {entry.hostName}
                </Link>
              )}
            </td>
          ) : null}
        </tr>
      );
    });
  }

  const showGroupByHost = type === "all" || type === "host";

  return (
    <main className="page-shell">
      <div className="mb-6">
        <h1 className="page-title">Directory</h1>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
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
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="directory-search">
          Search directory
        </label>
        <input
          id="directory-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, email, or host"
          className="spares-field h-11 min-w-[12rem] flex-1 rounded-2xl border-0 px-4 text-[15px] outline-none"
        />
        {type === "host" ? (
          <Link className={DIRECTORY_CREATE_CHIP} href="/staff/tenants">
            New Host
          </Link>
        ) : null}
        {type === "customer" ? (
          <button
            type="button"
            className={DIRECTORY_CREATE_CHIP}
            aria-expanded={creatingCustomer}
            onClick={() => setCreatingCustomer((open) => !open)}
          >
            {creatingCustomer ? "Close" : "New Customer"}
          </button>
        ) : null}
        {type === "staff" ? (
          <button
            type="button"
            className={DIRECTORY_CREATE_CHIP}
            aria-expanded={creatingStaff}
            onClick={() => setCreatingStaff((open) => !open)}
          >
            {creatingStaff ? "Close" : "New Staff"}
          </button>
        ) : null}
        {type === "person" ? (
          <button
            type="button"
            className={DIRECTORY_CREATE_CHIP}
            aria-expanded={creatingPerson}
            onClick={() => setCreatingPerson((open) => !open)}
          >
            {creatingPerson ? "Close" : "New Person"}
          </button>
        ) : null}
        {showGroupByHost ? (
          <button
            type="button"
            aria-pressed={groupByHost}
            onClick={() => setGroupByHost((current) => !current)}
            className={groupByHost ? "btn-secondary text-sm" : "btn-soft text-sm"}
          >
            Group by host
          </button>
        ) : null}
        <p className="text-sm text-muted tabular-nums">
          {visible.length} {visible.length === 1 ? "entry" : "entries"}
        </p>
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

      {type === "customer" && creatingCustomer ? (
        <form onSubmit={(event) => void handleCreateCustomer(event)} className="catalog-create mb-6">
          <div className="catalog-create-copy">
            <h2 className="text-lg font-semibold">New customer company</h2>
          </div>
          <label className="block max-w-md">
            <span className="text-sm font-medium">Company name</span>
            <input
              required
              value={newCustomerName}
              onChange={(event) => setNewCustomerName(event.target.value)}
              className="spares-field mt-1.5 h-12 w-full rounded-2xl border-0 px-4 text-[16px] outline-none"
            />
          </label>
          <div className="catalog-create-actions">
            <button type="button" className="btn-soft" onClick={() => setCreatingCustomer(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={creatingCustomerSubmitting}>
              {creatingCustomerSubmitting ? "Creating…" : "Create customer"}
            </button>
          </div>
        </form>
      ) : null}

      {type === "staff" && creatingStaff ? (
        <div className="mb-6">
          <StaffTeamPanel
            embed="create-only"
            onCreated={() => {
              refresh();
              setCreatingStaff(false);
            }}
            onCancel={() => setCreatingStaff(false)}
          />
        </div>
      ) : null}

      {loading ? <p className="text-muted">Loading directory…</p> : null}
      {error ? (
        <p className="text-danger mb-3" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && grouped ? (
        <div className="stack gap-8">
          {grouped.map(([hostId, group]) => (
            <section key={hostId}>
              <h2 className="text-base font-semibold mb-1">
                <Link
                  className="hover:underline"
                  href={`/staff/platform/${encodeURIComponent(hostId)}`}
                >
                  {group.hostName}
                </Link>
              </h2>
              <p className="text-xs text-muted font-mono mb-2">{hostId}</p>
              <table className="w-full min-w-[420px] text-left text-sm">
                <tbody>{renderRows(group.rows, false)}</tbody>
              </table>
            </section>
          ))}
        </div>
      ) : null}

      {!loading && !grouped ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-muted">
                {columns.map((column) => (
                  <th key={column.key} className="py-2 pr-4 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className="inline-flex items-center gap-1 hover:text-[var(--spares-ink)]"
                      aria-label={`Sort by ${column.label}`}
                    >
                      {column.label}
                      {sortKey === column.key ? (
                        <span aria-hidden="true" className="text-[10px]">
                          {sortDir === "asc" ? "▲" : "▼"}
                        </span>
                      ) : null}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>{renderRows(visible, true)}</tbody>
          </table>
        </div>
      ) : null}
    </main>
  );
}
