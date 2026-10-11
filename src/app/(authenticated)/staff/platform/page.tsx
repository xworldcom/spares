"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api/client";
import { errorMessage, isForbidden } from "@/lib/api/errors";
import { formatSsoSummary } from "@/lib/auth/sso-domain";
import type { Tenant } from "@/types";

type DeploymentRow = {
  tenant: Tenant;
  kind: "host" | "satellite";
  inactive: boolean;
  size: {
    staffUsers: number;
    customerPeople: number;
    customers: number;
    sites: number;
    machines: number;
    openTickets: number;
    openQuotes: number;
  };
  usage: {
    label: string;
    machinesCreated: number;
    quotesCreated: number;
    ticketsCreated: number;
    usageRowUpdates: number;
  };
};

type DeploymentsResponse = { deployments: DeploymentRow[] };

type SortKey =
  | "company"
  | "kind"
  | "status"
  | "staff"
  | "people"
  | "customers"
  | "sites"
  | "machines"
  | "openTickets"
  | "openQuotes"
  | "activity";

const SORT_COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: "company", label: "Company" },
  { key: "kind", label: "Type" },
  { key: "status", label: "Status" },
  { key: "staff", label: "Staff" },
  { key: "people", label: "People" },
  { key: "customers", label: "Customers" },
  { key: "sites", label: "Sites" },
  { key: "machines", label: "Machines" },
  { key: "openTickets", label: "Open care" },
  { key: "openQuotes", label: "Open quotes" },
  { key: "activity", label: "30-day activity" },
];

function activityScore(row: DeploymentRow) {
  return (
    row.usage.machinesCreated +
    row.usage.quotesCreated +
    row.usage.ticketsCreated +
    row.usage.usageRowUpdates
  );
}

function sortValue(row: DeploymentRow, key: SortKey): string | number {
  switch (key) {
    case "company":
      return row.tenant.name.toLowerCase();
    case "kind":
      return row.kind === "host" ? 0 : 1;
    case "status":
      return row.inactive ? 1 : 0;
    case "staff":
      return row.size.staffUsers;
    case "people":
      return row.size.customerPeople;
    case "customers":
      return row.size.customers;
    case "sites":
      return row.size.sites;
    case "machines":
      return row.size.machines;
    case "openTickets":
      return row.size.openTickets;
    case "openQuotes":
      return row.size.openQuotes;
    case "activity":
      return activityScore(row);
  }
}

export default function PlatformHostsPage() {
  return (
    <RequireAuth role="staff">
      <PlatformHosts />
    </RequireAuth>
  );
}

function PlatformHosts() {
  const { user } = useAuth();
  const [rows, setRows] = useState<DeploymentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("company");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [busyTenantId, setBusyTenantId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.platformOwner) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    try {
      const data = await apiFetch<DeploymentsResponse>("/api/platform/deployments");
      setRows(data.deployments);
      setForbidden(false);
      setError(null);
    } catch (cause) {
      if (isForbidden(cause)) {
        setForbidden(true);
      } else {
        setError(errorMessage(cause, "Could not load hosts"));
      }
    } finally {
      setLoading(false);
    }
  }, [user?.platformOwner]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    const filtered = trimmed
      ? rows.filter((row) =>
          [row.tenant.name, row.tenant.slug, row.tenant.id, ...(row.tenant.ssoDomains ?? [])].some(
            (field) => field.toLowerCase().includes(trimmed),
          ),
        )
      : rows;
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
      return a.tenant.name.localeCompare(b.tenant.name);
    });
  }, [rows, query, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "company" || key === "kind" || key === "status" ? "asc" : "desc");
    }
  }

  async function setSuspended(row: DeploymentRow, suspended: boolean) {
    setBusyTenantId(row.tenant.id);
    setError(null);
    try {
      await apiFetch(`/api/platform/tenants/${encodeURIComponent(row.tenant.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ inactive: suspended }),
      });
      await load();
    } catch (cause) {
      setError(errorMessage(cause, "Update failed"));
    } finally {
      setBusyTenantId(null);
    }
  }

  if (!user?.platformOwner || forbidden) {
    return (
      <main className="page-shell">
        <h1 className="page-title">Hosts</h1>
        <p className="text-muted">Platform owner access is required.</p>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Hosts</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link className="btn-secondary text-sm" href="/staff/platform/inquiries">
            Inquiries
          </Link>
          <Link className="btn-secondary text-sm" href="/staff/platform/sign-in">
            Sign-in
          </Link>
          <Link className="btn-secondary text-sm" href="/staff/platform/assistant">
            AI
          </Link>
          <Link className="btn-secondary text-sm" href="/staff/directory">
            Directory
          </Link>
          <Link className="btn-primary text-sm" href="/staff/tenants">
            New host
          </Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="hosts-search">
          Search hosts
        </label>
        <input
          id="hosts-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search company, handle, domain, or tenant id"
          className="spares-field h-11 w-full max-w-sm rounded-2xl border-0 px-4 text-[15px] outline-none"
        />
        <p className="text-sm text-muted tabular-nums">
          {visible.length} of {rows.length} {rows.length === 1 ? "host" : "hosts"}
        </p>
      </div>

      {loading ? <p className="text-muted">Loading hosts…</p> : null}
      {error ? (
        <p className="text-danger mb-3" role="alert">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-muted">
              {SORT_COLUMNS.map((column) => (
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
              <th className="py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.tenant.id} className="border-b border-white/5">
                <td className="py-2.5 pr-4">
                  <Link
                    className="font-medium hover:underline"
                    href={`/staff/platform/${encodeURIComponent(row.tenant.id)}`}
                  >
                    {row.tenant.name}
                  </Link>
                  <div className="text-xs text-muted font-mono">{row.tenant.id}</div>
                  {formatSsoSummary(row.tenant) ? (
                    <div className="text-xs text-muted">{formatSsoSummary(row.tenant)}</div>
                  ) : null}
                </td>
                <td className="py-2.5 pr-4 text-muted whitespace-nowrap">
                  {row.kind === "host" ? "Soft Launch Host" : "Satellite"}
                </td>
                <td className="py-2.5 pr-4 whitespace-nowrap">
                  {row.inactive ? (
                    <span className="text-amber-400/90">Suspended</span>
                  ) : (
                    <span className="text-muted">Active</span>
                  )}
                </td>
                <td className="py-2.5 pr-4 tabular-nums">{row.size.staffUsers}</td>
                <td className="py-2.5 pr-4 tabular-nums">{row.size.customerPeople}</td>
                <td className="py-2.5 pr-4 tabular-nums">{row.size.customers}</td>
                <td className="py-2.5 pr-4 tabular-nums">{row.size.sites}</td>
                <td className="py-2.5 pr-4 tabular-nums">{row.size.machines}</td>
                <td className="py-2.5 pr-4 tabular-nums">{row.size.openTickets}</td>
                <td className="py-2.5 pr-4 tabular-nums">{row.size.openQuotes}</td>
                <td className="py-2.5 pr-4 text-muted text-xs leading-relaxed">
                  {row.usage.machinesCreated} machines · {row.usage.quotesCreated} quotes ·{" "}
                  {row.usage.ticketsCreated} tickets · {row.usage.usageRowUpdates} usage
                </td>
                <td className="py-2.5 whitespace-nowrap">
                  {row.kind === "host" ? (
                    <span className="text-xs text-muted">Always on</span>
                  ) : (
                    <button
                      type="button"
                      className="btn-soft text-xs"
                      disabled={busyTenantId === row.tenant.id}
                      onClick={() => void setSuspended(row, !row.inactive)}
                    >
                      {row.inactive ? "Reactivate" : "Suspend"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted mt-6 max-w-3xl">
        Counts are live. Activity is the last 30 days. The Soft Launch host cannot be
        suspended or deleted.
      </p>
    </main>
  );
}
