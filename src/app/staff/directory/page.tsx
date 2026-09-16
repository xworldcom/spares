"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api/client";
import { errorMessage, isForbidden } from "@/lib/api/errors";
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
  { value: "customer", label: "Customers" },
  { value: "person", label: "People" },
];

const TYPE_LABELS: Record<DirectoryEntryType, string> = {
  host: "Host",
  customer: "Customer",
  person: "Person",
};

const TYPE_ORDER: Record<DirectoryEntryType, number> = {
  host: 0,
  customer: 1,
  person: 2,
};

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
        <PlatformDirectory />
      </Suspense>
    </RequireAuth>
  );
}

function PlatformDirectory() {
  const { user } = useAuth();
  const search = useSearchParams();
  const initialHost = search.get("host") ?? "";
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<TypeFilter>("all");
  const [query, setQuery] = useState(initialHost);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [groupByHost, setGroupByHost] = useState(false);

  const load = useCallback(async () => {
    if (!user?.platformOwner) {
      setForbidden(true);
      setLoading(false);
      return;
    }
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
  }, [user?.platformOwner]);

  useEffect(() => {
    void load();
  }, [load]);

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
    if (!groupByHost) {
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
  }, [groupByHost, visible]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  if (!user?.platformOwner || forbidden) {
    return (
      <main className="page-shell">
        <h1 className="page-title">Directory</h1>
        <p className="text-muted">Platform owner access is required to browse the directory.</p>
      </main>
    );
  }

  const columns: Array<{ key: SortKey; label: string }> = [
    { key: "name", label: "Name" },
    { key: "type", label: "Type" },
    { key: "host", label: "Host" },
  ];

  function renderRows(rows: DirectoryEntry[], includeHostColumn: boolean) {
    return rows.map((entry) => (
      <tr key={`${entry.type}:${entry.id}`} className="border-b border-white/5">
        <td className="py-2.5 pr-4">
          {entry.type === "host" ? (
            <Link
              className="font-medium hover:underline"
              href={`/staff/platform/${encodeURIComponent(entry.id)}`}
            >
              {entry.name}
            </Link>
          ) : (
            <span className="font-medium">{entry.name}</span>
          )}
          {entry.email ? (
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
          <td className="py-2.5 pr-4 whitespace-nowrap">
            <Link
              className="text-muted hover:underline"
              href={`/staff/platform/${encodeURIComponent(entry.hostId)}`}
            >
              {entry.hostName}
            </Link>
          </td>
        ) : null}
      </tr>
    ));
  }

  return (
    <main className="page-shell">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Directory</h1>
          <p className="text-muted mt-1 max-w-2xl">
            Find anything across every host install — host companies, their customers, and
            customer people. Manage records inside each host&apos;s own console.
          </p>
        </div>
        <Link className="btn-secondary text-sm" href="/staff/platform">
          Hosts
        </Link>
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
        <label className="sr-only" htmlFor="directory-search">
          Search directory
        </label>
        <input
          id="directory-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, email, or host"
          className="spares-field h-11 w-full max-w-sm rounded-2xl border-0 px-4 text-[15px] outline-none"
        />
        <button
          type="button"
          aria-pressed={groupByHost}
          onClick={() => setGroupByHost((current) => !current)}
          className={groupByHost ? "btn-secondary text-sm" : "btn-soft text-sm"}
        >
          Group by host
        </button>
        <p className="text-sm text-muted tabular-nums">
          {visible.length} {visible.length === 1 ? "entry" : "entries"}
        </p>
      </div>

      {loading ? <p className="text-muted">Loading directory…</p> : null}
      {error ? (
        <p className="text-danger mb-3" role="alert">
          {error}
        </p>
      ) : null}

      {grouped ? (
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
      ) : (
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
      )}
    </main>
  );
}
