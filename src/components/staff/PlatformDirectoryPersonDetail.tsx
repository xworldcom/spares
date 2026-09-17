"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PersonGlyph } from "@/components/catalog/CatalogGlyph";
import { ErrorState } from "@/components/states/ErrorState";
import {
  AccessCascadePicker,
  grantFromPublicUser,
} from "@/components/staff/AccessCascadePicker";
import {
  grantFromUser,
  normalizeAccessGrant,
  type AccessGrant,
} from "@/lib/access";
import {
  deletePlatformDirectoryUser,
  getPlatformDirectoryUser,
  updatePlatformDirectoryUser,
  type PlatformDirectoryUserDetail,
} from "@/lib/api/platform-directory";
import { errorMessage } from "@/lib/api/errors";
import type { MachineSummary } from "@/lib/api/types";
import { displayPersonName } from "@/lib/ui/display-name";

type PersonProfile = { name: string; email: string };

function profileFromDetail(detail: PlatformDirectoryUserDetail): PersonProfile {
  return {
    name: detail.user.name?.trim() ?? "",
    email: detail.user.email,
  };
}

function grantsEqual(left: AccessGrant, right: AccessGrant) {
  const leftSites = [...left.siteIds].sort().join(",");
  const rightSites = [...right.siteIds].sort().join(",");
  const leftMachines = [...left.machineIds].sort().join(",");
  const rightMachines = [...right.machineIds].sort().join(",");
  return leftSites === rightSites && leftMachines === rightMachines;
}

export function PlatformDirectoryPersonDetail({ userId }: { userId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<PlatformDirectoryUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<PersonProfile>({ name: "", email: "" });
  const [savedProfile, setSavedProfile] = useState<PersonProfile>({ name: "", email: "" });
  const [access, setAccess] = useState<AccessGrant>(grantFromUser({}));
  const [savedAccess, setSavedAccess] = useState<AccessGrant>(grantFromUser({}));

  const machines = useMemo((): MachineSummary[] => {
    if (!detail) {
      return [];
    }
    return detail.machines.map((row) => ({
      id: row.id,
      name: row.name,
      siteId: row.siteId,
    }));
  }, [detail]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getPlatformDirectoryUser(userId);
      setDetail(next);
      const nextProfile = profileFromDetail(next);
      setProfile(nextProfile);
      setSavedProfile(nextProfile);
      const grant = grantFromPublicUser(next.user);
      setAccess(grant);
      setSavedAccess(grant);
    } catch (cause) {
      setError(errorMessage(cause, "Could not load this person."));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const profileDirty =
    profile.name.trim() !== savedProfile.name.trim() ||
    profile.email.trim() !== savedProfile.email.trim();
  const accessDirty = !grantsEqual(
    normalizeAccessGrant(access, machines),
    normalizeAccessGrant(savedAccess, machines),
  );

  const readOnly = detail?.protectedLogin ?? false;
  const isCustomer = detail?.role === "customer";

  async function saveProfile() {
    if (!detail || readOnly) {
      return;
    }
    const trimmedEmail = profile.email.trim();
    if (!trimmedEmail) {
      setError("Email is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const user = await updatePlatformDirectoryUser(userId, {
        email: trimmedEmail,
        name: profile.name.trim() || null,
      });
      setDetail((current) => (current ? { ...current, user } : current));
      const nextProfile = { name: user.name?.trim() ?? "", email: user.email };
      setProfile(nextProfile);
      setSavedProfile(nextProfile);
    } catch (cause) {
      setError(errorMessage(cause, "Could not save profile."));
    } finally {
      setSaving(false);
    }
  }

  async function saveAccess() {
    if (!detail || !isCustomer || readOnly) {
      return;
    }
    setSaving(true);
    setError(null);
    const grant = normalizeAccessGrant(access, machines);
    try {
      const user = await updatePlatformDirectoryUser(userId, {
        siteIds: grant.siteIds,
        machineIds: grant.machineIds,
      });
      setDetail((current) => (current ? { ...current, user } : current));
      const nextGrant = grantFromPublicUser(user);
      setAccess(nextGrant);
      setSavedAccess(nextGrant);
    } catch (cause) {
      setError(errorMessage(cause, "Could not save access."));
    } finally {
      setSaving(false);
    }
  }

  async function deactivate() {
    if (!detail || readOnly) {
      return;
    }
    const label = displayPersonName({ name: profile.name, email: profile.email });
    if (
      !window.confirm(
        `Delete login for ${label}? They will lose sign-in access. This cannot be undone from the directory.`,
      )
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await deletePlatformDirectoryUser(userId);
      router.push("/staff/directory");
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause, "Could not delete this login."));
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-muted">Loading…</p>;
  }

  if (error && !detail) {
    return (
      <ErrorState
        title="Could not open person"
        message={error}
        onRetry={() => void load()}
      />
    );
  }

  if (!detail) {
    return null;
  }

  const typeLabel = detail.role === "staff" ? "Staff" : "Customer person";
  const displayName = displayPersonName({ name: profile.name, email: profile.email });

  return (
    <main className="page-shell max-w-3xl">
      <p className="mb-4">
        <Link href="/staff/directory" className="text-sm text-muted hover:underline">
          ← Directory
        </Link>
      </p>

      <div className="mb-6 flex flex-wrap items-start gap-4">
        <PersonGlyph email={detail.user.email} />
        <div className="min-w-0 flex-1">
          <h1 className="page-title">{displayName}</h1>
          <p className="text-muted mt-1">
            {typeLabel} on{" "}
            <Link
              href={`/staff/platform/${encodeURIComponent(detail.hostId)}`}
              className="hover:underline"
            >
              {detail.hostName}
            </Link>
          </p>
        </div>
      </div>

      {readOnly ? (
        <p className="mb-4 rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-200/90">
          This login is protected (demo or platform owner). Profile changes and deactivation are
          disabled here.
        </p>
      ) : null}

      {error ? (
        <p className="text-danger mb-3" role="alert">
          {error}
        </p>
      ) : null}

      <section className="catalog-stack mb-8">
        <h2 className="text-lg font-semibold">Profile</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">Name</span>
            <input
              value={profile.name}
              disabled={saving || readOnly}
              onChange={(event) => setProfile((p) => ({ ...p, name: event.target.value }))}
              className="spares-field mt-1.5 h-12 w-full rounded-2xl border-0 px-4 text-[16px] outline-none"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input
              type="email"
              value={profile.email}
              disabled={saving || readOnly}
              onChange={(event) => setProfile((p) => ({ ...p, email: event.target.value }))}
              className="spares-field mt-1.5 h-12 w-full rounded-2xl border-0 px-4 text-[16px] outline-none"
            />
          </label>
        </div>
        <button
          type="button"
          className="btn-primary"
          disabled={saving || readOnly || !profileDirty}
          onClick={() => void saveProfile()}
        >
          Save profile
        </button>
      </section>

      {isCustomer ? (
        <section className="catalog-stack mb-8">
          <h2 className="text-lg font-semibold">Access</h2>
          <AccessCascadePicker
            grant={access}
            onChange={setAccess}
            sites={detail.sites}
            accounts={detail.customers}
            machines={machines}
            disabled={saving || readOnly}
            legend={`Access for ${detail.user.email}`}
          />
          <button
            type="button"
            className="btn-secondary"
            disabled={saving || readOnly || !accessDirty}
            onClick={() => void saveAccess()}
          >
            Save access
          </button>
        </section>
      ) : null}

      <section className="border-t border-white/10 pt-6">
        <h2 className="text-lg font-semibold text-[#f0c4c0]">Delete login</h2>
        <p className="text-muted mt-1 mb-4 text-sm">
          Removes sign-in access for this {detail.role === "staff" ? "staff member" : "person"}.
          Data on the host is unchanged.
        </p>
        <button
          type="button"
          className="btn-soft text-[#f0c4c0]"
          disabled={saving || readOnly}
          onClick={() => void deactivate()}
        >
          Delete login
        </button>
      </section>
    </main>
  );
}
