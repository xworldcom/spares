"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api/client";
import type { Tenant } from "@/types";

type DeploymentDetail = {
  deployment: {
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
      windowDays: number;
      machinesCreated: number;
      quotesCreated: number;
      ticketsCreated: number;
      usageRowUpdates: number;
    };
  };
  staff: Array<{ id: string; email: string; tenantId: string | null }>;
};

export default function PlatformTenantDetailPage() {
  return (
    <RequireAuth role="staff">
      <TenantDetail />
    </RequireAuth>
  );
}

function TenantDetail() {
  const { user } = useAuth();
  const params = useParams();
  const tenantId = typeof params.tenantId === "string" ? params.tenantId : "";
  const [detail, setDetail] = useState<DeploymentDetail | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user?.platformOwner || !tenantId) {
      setForbidden(true);
      return;
    }
    try {
      const data = await apiFetch<DeploymentDetail>(
        `/api/platform/deployments/${encodeURIComponent(tenantId)}`,
      );
      setDetail(data);
      setDisplayName(data.deployment.tenant.name);
      setForbidden(false);
      setError(null);
    } catch (cause) {
      if (cause instanceof Error && cause.message.includes("403")) {
        setForbidden(true);
      } else {
        setError(cause instanceof Error ? cause.message : "Could not load tenant");
      }
    }
  }, [tenantId, user?.platformOwner]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveName() {
    if (!tenantId) {
      return;
    }
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      await apiFetch(`/api/platform/tenants/${encodeURIComponent(tenantId)}`, {
        method: "PATCH",
        body: JSON.stringify({ name: displayName }),
      });
      setNotice("Display name updated.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleInactive() {
    if (!tenantId || !detail) {
      return;
    }
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      await apiFetch(`/api/platform/tenants/${encodeURIComponent(tenantId)}`, {
        method: "PATCH",
        body: JSON.stringify({ inactive: !detail.deployment.inactive }),
      });
      setNotice(detail.deployment.inactive ? "Marked active." : "Marked inactive.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  if (!user?.platformOwner || forbidden) {
    return (
      <main className="page-shell">
        <h1 className="page-title">Company deployment</h1>
        <p className="text-muted">Platform owner access is required.</p>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="page-shell">
        <p className="text-muted">{error ?? "Loading…"}</p>
      </main>
    );
  }

  const { deployment, staff } = detail;

  return (
    <main className="page-shell">
      <p className="mb-4">
        <Link className="text-sm text-muted hover:underline" href="/staff/platform">
          ← Platform deployments
        </Link>
      </p>

      <h1 className="page-title">{deployment.tenant.name}</h1>
      <p className="text-muted font-mono text-sm">{deployment.tenant.id}</p>
      <p className="text-muted text-sm">
        Handle <code>{deployment.tenant.slug}</code> ·{" "}
        {deployment.kind === "host" ? "Soft Launch host" : "Satellite host"} · Created{" "}
        {new Date(deployment.tenant.createdAt).toLocaleString()}
        {deployment.inactive ? " · Inactive" : ""}
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section className="card p-4">
          <h2 className="text-lg font-semibold mb-3">Size (catalog)</h2>
          <ul className="stack gap-2 text-sm">
            <li>Staff users: {deployment.size.staffUsers}</li>
            <li>Customer people (contacts): {deployment.size.customerPeople}</li>
            <li>Customer accounts: {deployment.size.customers}</li>
            <li>Sites: {deployment.size.sites}</li>
            <li>Machines: {deployment.size.machines}</li>
            <li>Open Care tickets: {deployment.size.openTickets}</li>
            <li>Open quotes: {deployment.size.openQuotes}</li>
          </ul>
        </section>

        <section className="card p-4">
          <h2 className="text-lg font-semibold mb-3">Usage</h2>
          <p className="text-sm text-muted mb-3">{deployment.usage.label}</p>
          <ul className="stack gap-2 text-sm">
            <li>Machines added: {deployment.usage.machinesCreated}</li>
            <li>Quotes created: {deployment.usage.quotesCreated}</li>
            <li>Tickets opened: {deployment.usage.ticketsCreated}</li>
            <li>Machine usage updates: {deployment.usage.usageRowUpdates}</li>
          </ul>
        </section>
      </div>

      <section className="card p-4 mt-6 max-w-lg">
        <h2 className="text-lg font-semibold mb-3">Display name</h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="input flex-1 min-w-[12rem]"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <button className="btn-primary" type="button" disabled={busy} onClick={() => void saveName()}>
            Save
          </button>
        </div>
        <button
          className="btn-secondary mt-4 text-sm"
          type="button"
          disabled={busy || deployment.kind === "host"}
          onClick={() => void toggleInactive()}
        >
          {deployment.inactive ? "Mark active" : "Mark inactive"}
        </button>
        {deployment.kind === "host" ? (
          <p className="text-xs text-muted mt-2">Soft Launch host cannot be marked inactive.</p>
        ) : null}
        {error ? <p className="text-danger mt-2">{error}</p> : null}
        {notice ? <p className="text-sm text-muted mt-2">{notice}</p> : null}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold mb-3">Staff on this tenant</h2>
        <p className="text-sm text-muted mb-3">
          Cross-check with the full list on{" "}
          <Link className="underline" href="/staff/tenants">Hosts</Link>.
        </p>
        <ul className="stack gap-2">
          {staff.map((row) => (
            <li key={row.id} className="card p-3 text-sm">
              <span className="font-medium">{row.email}</span>
              <span className="text-muted font-mono text-xs ml-2">{row.tenantId}</span>
            </li>
          ))}
          {staff.length === 0 ? <li className="text-muted text-sm">No staff users yet.</li> : null}
        </ul>
      </section>
    </main>
  );
}
