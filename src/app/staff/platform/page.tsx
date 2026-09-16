"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api/client";
import { isForbidden, errorMessage } from "@/lib/api/errors";
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

export default function PlatformAdminPage() {
  return (
    <RequireAuth role="staff">
      <PlatformHub />
    </RequireAuth>
  );
}

function PlatformHub() {
  const { user } = useAuth();
  const [rows, setRows] = useState<DeploymentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);

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
        setError(errorMessage(cause, "Could not load deployments"));
      }
    } finally {
      setLoading(false);
    }
  }, [user?.platformOwner]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user?.platformOwner || forbidden) {
    return (
      <main className="page-shell">
        <h1 className="page-title">Platform</h1>
        <p className="text-muted">Platform owner access is required to manage company deployments.</p>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Platform</h1>
          <p className="text-muted mt-1 max-w-2xl">
            Company deployments on the shared OEE360 host. Size and usage come from the live catalog
            — no separate analytics service.
          </p>
        </div>
        <Link className="btn-secondary text-sm" href="/staff/tenants">
          Add new host tenant
        </Link>
      </div>

      {loading ? <p className="text-muted">Loading deployments…</p> : null}
      {error ? <p className="text-danger">{error}</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-muted">
              <th className="py-2 pr-4 font-medium">Company</th>
              <th className="py-2 pr-4 font-medium">Role</th>
              <th className="py-2 pr-4 font-medium">Staff</th>
              <th className="py-2 pr-4 font-medium">People</th>
              <th className="py-2 pr-4 font-medium">Customers</th>
              <th className="py-2 pr-4 font-medium">Sites</th>
              <th className="py-2 pr-4 font-medium">Machines</th>
              <th className="py-2 pr-4 font-medium">Open care</th>
              <th className="py-2 pr-4 font-medium">Open quotes</th>
              <th className="py-2 font-medium">{rows[0]?.usage.label ?? "Recent activity"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.tenant.id} className="border-b border-white/5">
                <td className="py-3 pr-4">
                  <Link
                    className="font-medium hover:underline"
                    href={`/staff/platform/${encodeURIComponent(row.tenant.id)}`}
                  >
                    {row.tenant.name}
                  </Link>
                  <div className="text-xs text-muted font-mono">{row.tenant.slug}</div>
                  <div className="text-xs text-muted font-mono">{row.tenant.id}</div>
                  {row.inactive ? (
                    <span className="mt-1 inline-block text-xs text-amber-400/90">Inactive</span>
                  ) : null}
                </td>
                <td className="py-3 pr-4 capitalize text-muted">
                  {row.kind === "host" ? "Soft Launch host" : "Satellite"}
                </td>
                <td className="py-3 pr-4 tabular-nums">{row.size.staffUsers}</td>
                <td className="py-3 pr-4 tabular-nums">{row.size.customerPeople}</td>
                <td className="py-3 pr-4 tabular-nums">{row.size.customers}</td>
                <td className="py-3 pr-4 tabular-nums">{row.size.sites}</td>
                <td className="py-3 pr-4 tabular-nums">{row.size.machines}</td>
                <td className="py-3 pr-4 tabular-nums">{row.size.openTickets}</td>
                <td className="py-3 pr-4 tabular-nums">{row.size.openQuotes}</td>
                <td className="py-3 text-muted text-xs leading-relaxed">
                  {row.usage.machinesCreated} machines · {row.usage.quotesCreated} quotes ·{" "}
                  {row.usage.ticketsCreated} tickets · {row.usage.usageRowUpdates} usage updates
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted mt-6 max-w-3xl">
        Usage counts are rows created or updated in the last 30 days, using timestamps already stored
        with machines, quotes, tickets, and machine usage. Pack storage bytes are not tracked per
        tenant in v1.
      </p>
    </main>
  );
}
