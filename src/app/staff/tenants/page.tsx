"use client";

import { useCallback, useEffect, useState } from "react";
import type { Tenant } from "@/types";
import { DEFAULT_TENANT_ID, DEFAULT_TENANT_NAME } from "@/lib/tenant";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api/client";

type TenantsResponse = { tenants: Tenant[] };

type CreateTenantResponse = {
  tenant: Tenant;
  staffUser?: { id: string; email: string; role: string; tenantId?: string };
};

type PlatformStaffRow = {
  id: string;
  email: string;
  tenantId: string | null;
  tenantName: string | null;
};

type PlatformStaffResponse = { staff: PlatformStaffRow[] };

export default function StaffTenantsPage() {
  return (
    <RequireAuth role="staff">
      <PlatformTenants />
    </RequireAuth>
  );
}

function PlatformTenants() {
  const { user } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [staffRows, setStaffRows] = useState<PlatformStaffRow[]>([]);
  const [name, setName] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<TenantsResponse>("/api/platform/tenants");
      setTenants(data.tenants);
      setForbidden(false);
      if (user?.platformOwner) {
        const staffData = await apiFetch<PlatformStaffResponse>("/api/platform/staff");
        setStaffRows(staffData.staff);
      }
    } catch (cause) {
      if (cause instanceof Error && cause.message.includes("403")) {
        setForbidden(true);
      }
      setError(cause instanceof Error ? cause.message : "Could not load tenants");
    }
  }, [user?.platformOwner]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await apiFetch<CreateTenantResponse>("/api/platform/tenants", {
        method: "POST",
        body: JSON.stringify({
          name,
          staffEmail: staffEmail.trim() || undefined,
          staffPassword: staffPassword || undefined,
        }),
      });
      setName("");
      setStaffEmail("");
      setStaffPassword("");
      if (result.staffUser?.tenantId) {
        setNotice(
          `Created ${result.tenant.name}. First staff ${result.staffUser.email} → tenantId ${result.staffUser.tenantId}`,
        );
      } else {
        setNotice(`Created ${result.tenant.name} (${result.tenant.id}).`);
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  if (forbidden) {
    return (
      <main className="page-shell">
        <h1 className="page-title">Host companies</h1>
        <p className="text-muted">Platform owner access is required to manage host tenants.</p>
      </main>
    );
  }

  const hostTenant =
    tenants.find((row) => row.id === DEFAULT_TENANT_ID)?.name ?? DEFAULT_TENANT_NAME;

  return (
    <main className="page-shell">
      <h1 className="page-title">Host companies</h1>
      <p className="text-muted mb-6">
        Create automation-company tenants on the shared OEE360 platform. Existing Soft Launch →{" "}
        <code>{hostTenant}</code> (
        <code className="text-xs">{DEFAULT_TENANT_ID}</code>).
      </p>

      <form className="stack gap-3 max-w-md mb-10" onSubmit={onCreate}>
        <label className="stack gap-1">
          <span>Tenant name</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Acme Automation"
          />
        </label>
        <label className="stack gap-1">
          <span>First staff email (optional)</span>
          <input
            className="input"
            type="email"
            value={staffEmail}
            onChange={(e) => setStaffEmail(e.target.value)}
            placeholder="ops@acme-automation.com"
          />
        </label>
        <label className="stack gap-1">
          <span>Staff password (optional)</span>
          <input
            className="input"
            type="password"
            value={staffPassword}
            onChange={(e) => setStaffPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        {error ? <p className="text-danger">{error}</p> : null}
        {notice ? <p className="text-sm text-muted">{notice}</p> : null}
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create tenant"}
        </button>
      </form>

      <section>
        <h2 className="text-lg font-semibold mb-3">Tenants</h2>
        <ul className="stack gap-2">
          {tenants.map((tenant) => (
            <li key={tenant.id} className="card p-4">
              <div className="font-medium">{tenant.name}</div>
              <div className="text-sm text-muted">{tenant.slug}</div>
              <div className="text-xs text-muted font-mono">{tenant.id}</div>
            </li>
          ))}
        </ul>
      </section>

      {user?.platformOwner ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold mb-3">Staff accounts (tenant check)</h2>
          <p className="text-sm text-muted mb-3">
            First staff from Create tenant must show the new tenant id, not{" "}
            <code>{DEFAULT_TENANT_ID}</code>.
          </p>
          <ul className="stack gap-2">
            {staffRows.map((row) => (
              <li key={row.id} className="card p-4 text-sm">
                <div className="font-medium">{row.email}</div>
                <div className="text-muted">
                  {row.tenantName ?? "—"} ·{" "}
                  <code className="text-xs">{row.tenantId ?? "missing tenantId"}</code>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
