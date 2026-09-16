"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { CatalogSkeleton } from "@/components/catalog/CatalogSkeleton";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import {
  createStaffMember,
  listStaffTeam,
  type StaffTeamMember,
} from "@/lib/api/auth";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { Tenant } from "@/types";

export function StaffTeamPanel({
  fixedTenantId,
  onCreated,
  onCancel,
  embed,
}: {
  /** Platform owner detail pages pin staff to one tenant. */
  fixedTenantId?: string;
  onCreated?: () => void;
  onCancel?: () => void;
  /** Directory embed: render only the create form (no list or toolbar). */
  embed?: "create-only";
}) {
  const { user } = useAuth();
  const [staff, setStaff] = useState<StaffTeamMember[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [creating, setCreating] = useState(embed === "create-only");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const showTenantPicker =
    Boolean(user?.platformOwner) && !fixedTenantId && tenants.length > 1;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (user?.platformOwner) {
        const data = await apiFetch<{ tenants: Tenant[] }>("/api/platform/tenants");
        setTenants(data.tenants);
      }
      const effectiveTenant =
        fixedTenantId ??
        (user?.platformOwner && tenantId ? tenantId : user?.tenantId) ??
        undefined;
      const rows = await listStaffTeam(
        user?.platformOwner && effectiveTenant ? effectiveTenant : undefined,
      );
      setStaff(rows);
    } catch (cause) {
      setError(errorMessage(cause, "Could not load team."));
    } finally {
      setLoading(false);
    }
  }, [fixedTenantId, tenantId, user?.platformOwner, user?.tenantId]);

  useEffect(() => {
    if (fixedTenantId) {
      setTenantId(fixedTenantId);
    } else if (!tenantId && user?.tenantId) {
      setTenantId(user.tenantId);
    }
  }, [fixedTenantId, tenantId, user?.tenantId]);

  useEffect(() => {
    void load();
  }, [load, retryKey]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const targetTenant = fixedTenantId ?? (showTenantPicker ? tenantId : undefined);
      const created = await createStaffMember(
        email.trim(),
        password,
        targetTenant || undefined,
      );
      setStaff((current) =>
        [...current, created].sort((a, b) => a.email.localeCompare(b.email)),
      );
      setEmail("");
      setPassword("");
      setCreating(false);
      setNotice(`${created.email} can sign in on the login screen.`);
      onCreated?.();
    } catch (cause) {
      setError(errorMessage(cause, "Could not create that staff login."));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    if (embed === "create-only") {
      return <CatalogSkeleton variant="person" count={1} />;
    }
    return <CatalogSkeleton variant="person" count={3} />;
  }

  if (error && staff.length === 0 && embed !== "create-only") {
    return (
      <ErrorState
        title="Failed to load team"
        message={error}
        onRetry={() => setRetryKey((key) => key + 1)}
      />
    );
  }

  const createForm = creating ? (
        <form onSubmit={(event) => void handleCreate(event)} className="catalog-create">
          <div className="catalog-create-grid">
            {showTenantPicker ? (
              <div className="md:col-span-2">
                <label htmlFor="staff-tenant" className="block text-sm font-medium">
                  Company
                </label>
                <select
                  id="staff-tenant"
                  value={tenantId}
                  onChange={(event) => setTenantId(event.target.value)}
                  className="spares-field mt-1.5 h-12 w-full rounded-2xl border-0 px-4 text-[16px] outline-none"
                >
                  {tenants.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div>
              <label htmlFor="staff-email" className="block text-sm font-medium">
                Work email
              </label>
              <input
                id="staff-email"
                type="email"
                required
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="spares-field mt-1.5 h-12 w-full rounded-2xl border-0 px-4 text-[16px] outline-none"
              />
            </div>
            <div>
              <label htmlFor="staff-password" className="block text-sm font-medium">
                Temporary password
              </label>
              <input
                id="staff-password"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="spares-field mt-1.5 h-12 w-full rounded-2xl border-0 px-4 text-[16px] outline-none"
              />
              <p className="spares-muted mt-1.5 text-sm">At least 10 characters.</p>
            </div>
          </div>
          {error ? (
            <p className="text-sm text-[#f0c4c0]" role="alert">
              {error}
            </p>
          ) : null}
          <div className="catalog-create-actions">
            <button
              type="button"
              className="btn-soft inline-flex h-12 items-center justify-center rounded-full px-5 text-[15px] font-semibold"
              onClick={() => {
                setCreating(false);
                onCancel?.();
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary inline-flex h-12 items-center justify-center rounded-full px-5 text-[16px] font-semibold disabled:opacity-60"
            >
              {submitting ? "Creating…" : "Create staff login"}
            </button>
          </div>
        </form>
  ) : null;

  if (embed === "create-only") {
    return <section className="catalog-stack">{createForm}</section>;
  }

  return (
    <section className="catalog-stack">
      <div className="catalog-page-intro catalog-page-intro-split">
        <div>
          <h2 className="text-lg font-semibold">Staff logins</h2>
          <p className="text-sm text-muted">
            Real email and password — not the demo <code>staff@spares.local</code> account.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary catalog-toolbar-action"
          aria-expanded={creating}
          onClick={() => setCreating((open) => !open)}
        >
          {creating ? "Close" : "New staff"}
        </button>
      </div>

      {createForm}

      {notice ? (
        <p className="text-sm text-[#8ee0a8]" role="status">
          {notice}
        </p>
      ) : null}
      {error && staff.length > 0 ? (
        <p className="text-sm text-[#f0c4c0]" role="alert">
          {error}
        </p>
      ) : null}

      {staff.length === 0 ? (
        <EmptyState
          title="No staff logins yet"
          message="Add a staff member with a work email. They use the same login screen as everyone else."
        />
      ) : (
        <ul className="catalog-people-list">
          {staff.map((row) => (
            <li key={row.id} className="catalog-person-card">
              <div className="min-w-0">
                <p className="catalog-person-name">{row.email}</p>
                {user?.platformOwner ? (
                  <p className="catalog-person-email text-muted text-sm font-mono">
                    {row.tenantId ?? "missing tenant"}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
