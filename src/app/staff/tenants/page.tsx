"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Tenant } from "@/types";
import { DEFAULT_TENANT_ID, DEFAULT_TENANT_NAME } from "@/lib/tenant";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api/client";
import { isForbidden, errorMessage } from "@/lib/api/errors";
import { SsoAutorouteSelector } from "@/components/staff/SsoAutorouteSelector";

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
  const [ssoDomains, setSsoDomains] = useState("");
  const [ssoAutoroute, setSsoAutoroute] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user?.platformOwner) {
      setForbidden(true);
      return;
    }
    try {
      const data = await apiFetch<TenantsResponse>("/api/platform/tenants");
      setTenants(data.tenants);
      setForbidden(false);
      setError(null);
      const staffData = await apiFetch<PlatformStaffResponse>("/api/platform/staff");
      setStaffRows(staffData.staff);
    } catch (cause) {
      if (isForbidden(cause)) {
        setForbidden(true);
      }
      setError(errorMessage(cause, "Could not load tenants"));
    }
  }, [user?.platformOwner]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    const trimmedEmail = staffEmail.trim();
    if (trimmedEmail && !staffPassword) {
      setError("Staff password is required when first staff email is set.");
      return;
    }
    if (staffPassword && !trimmedEmail) {
      setError("First staff email is required when setting a password.");
      return;
    }
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
          ssoDomains: ssoDomains.trim() || undefined,
          ssoAutoroute,
        }),
      });
      setName("");
      setStaffEmail("");
      setStaffPassword("");
      setSsoDomains("");
      setSsoAutoroute(false);
      if (result.staffUser?.tenantId) {
        setNotice(
          `Created ${result.tenant.name}. First staff ${result.staffUser.email} → tenantId ${result.staffUser.tenantId}`,
        );
      } else {
        setNotice(`Created ${result.tenant.name} (${result.tenant.id}).`);
      }
      await load();
    } catch (cause) {
      setError(errorMessage(cause, "Create failed"));
    } finally {
      setBusy(false);
    }
  }

  if (!user?.platformOwner || forbidden) {
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
      <p className="mb-4">
        <Link className="text-sm text-muted hover:underline" href="/staff/platform">
          ← Hosts
        </Link>
      </p>
      <h1 className="page-title">New host</h1>
      <p className="text-muted mb-6">
        Create automation-company tenants on the shared OEE360 platform. Existing Soft Launch →{" "}
        <code>{hostTenant}</code> (
        <code className="text-xs">{DEFAULT_TENANT_ID}</code>).
      </p>

      <form className="stack gap-4 max-w-md mb-10" onSubmit={onCreate}>
        <label className="stack gap-1">
          <span className="text-sm font-medium">Company name</span>
          <input
            className="spares-field h-12 w-full rounded-2xl border-0 px-4 text-[16px] outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Acme Automation"
          />
        </label>
        <label className="stack gap-1">
          <span className="text-sm font-medium">SSO domain (optional)</span>
          <input
            className="spares-field h-12 w-full rounded-2xl border-0 px-4 text-[16px] outline-none"
            value={ssoDomains}
            onChange={(e) => setSsoDomains(e.target.value)}
            placeholder="shape.com"
            autoComplete="off"
          />
          <p className="spares-muted text-sm">
            Company work domain for this host. Comma-separate extras (shape.com,
            shapetech.com).
          </p>
        </label>
        <SsoAutorouteSelector value={ssoAutoroute} onChange={setSsoAutoroute} />
        <label className="stack gap-1">
          <span className="text-sm font-medium">First staff email (optional)</span>
          <input
            className="spares-field h-12 w-full rounded-2xl border-0 px-4 text-[16px] outline-none"
            type="email"
            value={staffEmail}
            onChange={(e) => setStaffEmail(e.target.value)}
            placeholder="ops@acme-automation.com"
            autoComplete="off"
          />
        </label>
        <label className="stack gap-1">
          <span className="text-sm font-medium">Staff password (optional)</span>
          <input
            className="spares-field h-12 w-full rounded-2xl border-0 px-4 text-[16px] outline-none"
            type="password"
            value={staffPassword}
            onChange={(e) => setStaffPassword(e.target.value)}
            minLength={staffEmail.trim() ? 10 : undefined}
            autoComplete="new-password"
          />
          <p className="spares-muted text-sm">At least 10 characters when creating first staff.</p>
        </label>
        {error ? <p className="text-danger" role="alert">{error}</p> : null}
        {notice ? <p className="text-sm text-muted" role="status">{notice}</p> : null}
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Add new host tenant"}
        </button>
      </form>

      <section>
        <h2 className="text-lg font-semibold mb-3">Tenants</h2>
        <ul className="stack gap-2">
          {tenants.map((tenant) => (
            <li key={tenant.id} className="card p-4">
              <div className="font-medium">{tenant.name}</div>
              <div className="text-sm text-muted">{tenant.slug}</div>
              {tenant.ssoDomains?.length ? (
                <div className="text-sm text-muted">
                  SSO {tenant.ssoDomains.join(", ")} · Autoroute{" "}
                  {tenant.ssoAutoroute ? "on" : "off"}
                </div>
              ) : null}
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
