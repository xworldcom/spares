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
  deletePerson,
  listCustomerAccounts,
  listCustomers,
  listSites,
  updatePersonAccess,
  updatePersonProfile,
} from "@/lib/api/auth";
import { listMachines } from "@/lib/api/machines";
import { errorMessage } from "@/lib/api/errors";
import type { MachineSummary, PublicUser } from "@/lib/api/types";
import { displayPersonName } from "@/lib/ui/display-name";

type PersonProfile = { name: string; email: string };

function profileFromUser(user: PublicUser): PersonProfile {
  return {
    name: user.name?.trim() ?? "",
    email: user.email,
  };
}

function grantsEqual(left: AccessGrant, right: AccessGrant) {
  const leftSites = [...left.siteIds].sort().join(",");
  const rightSites = [...right.siteIds].sort().join(",");
  const leftMachines = [...left.machineIds].sort().join(",");
  const rightMachines = [...right.machineIds].sort().join(",");
  return leftSites === rightSites && leftMachines === rightMachines;
}

export function TenantDirectoryPersonDetail({ userId }: { userId: string }) {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<PersonProfile>({ name: "", email: "" });
  const [savedProfile, setSavedProfile] = useState<PersonProfile>({ name: "", email: "" });
  const [access, setAccess] = useState<AccessGrant>(grantFromUser({}));
  const [savedAccess, setSavedAccess] = useState<AccessGrant>(grantFromUser({}));
  const [sites, setSites] = useState<Awaited<ReturnType<typeof listSites>>>([]);
  const [accounts, setAccounts] = useState<Awaited<ReturnType<typeof listCustomerAccounts>>>([]);
  const [machines, setMachines] = useState<MachineSummary[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [people, nextSites, nextAccounts, nextMachines] = await Promise.all([
        listCustomers(),
        listSites(),
        listCustomerAccounts(),
        listMachines(),
      ]);
      const match = people.find((row) => row.id === userId) ?? null;
      if (!match) {
        setUser(null);
        setError("Person not found.");
        return;
      }
      setUser(match);
      const nextProfile = profileFromUser(match);
      setProfile(nextProfile);
      setSavedProfile(nextProfile);
      const grant = grantFromPublicUser(match);
      setAccess(grant);
      setSavedAccess(grant);
      setSites(nextSites);
      setAccounts(nextAccounts);
      setMachines(nextMachines);
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
  const accessDirty = useMemo(
    () =>
      !grantsEqual(
        normalizeAccessGrant(access, machines),
        normalizeAccessGrant(savedAccess, machines),
      ),
    [access, savedAccess, machines],
  );

  async function saveProfile() {
    if (!user) {
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
      const next = await updatePersonProfile(userId, {
        email: trimmedEmail,
        name: profile.name.trim() || null,
      });
      setUser(next);
      const nextProfile = profileFromUser(next);
      setProfile(nextProfile);
      setSavedProfile(nextProfile);
    } catch (cause) {
      setError(errorMessage(cause, "Could not save profile."));
    } finally {
      setSaving(false);
    }
  }

  async function saveAccess() {
    if (!user) {
      return;
    }
    setSaving(true);
    setError(null);
    const grant = normalizeAccessGrant(access, machines);
    try {
      const next = await updatePersonAccess(userId, grant);
      setUser(next);
      const nextGrant = grantFromPublicUser(next);
      setAccess(nextGrant);
      setSavedAccess(nextGrant);
    } catch (cause) {
      setError(errorMessage(cause, "Could not save access."));
    } finally {
      setSaving(false);
    }
  }

  async function deactivate() {
    if (!user) {
      return;
    }
    const label = displayPersonName({ name: profile.name, email: profile.email });
    if (!window.confirm(`Remove ${label}? They will lose login access.`)) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await deletePerson(userId);
      router.push("/staff/directory?type=person");
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause, "Could not remove that person."));
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-muted">Loading…</p>;
  }

  if (error && !user) {
    return (
      <ErrorState
        title="Could not open person"
        message={error}
        onRetry={() => void load()}
      />
    );
  }

  if (!user) {
    return null;
  }

  const displayName = displayPersonName({ name: profile.name, email: profile.email });

  return (
    <main className="page-shell max-w-3xl">
      <p className="mb-4">
        <Link href="/staff/directory" className="text-sm text-muted hover:underline">
          ← Directory
        </Link>
      </p>

      <div className="mb-6 flex flex-wrap items-start gap-4">
        <PersonGlyph email={user.email} />
        <div className="min-w-0 flex-1">
          <h1 className="page-title">{displayName}</h1>
          <p className="text-muted mt-1">Customer person on this install</p>
        </div>
      </div>

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
              disabled={saving}
              onChange={(event) => setProfile((p) => ({ ...p, name: event.target.value }))}
              className="spares-field mt-1.5 h-12 w-full rounded-2xl border-0 px-4 text-[16px] outline-none"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input
              type="email"
              value={profile.email}
              disabled={saving}
              onChange={(event) => setProfile((p) => ({ ...p, email: event.target.value }))}
              className="spares-field mt-1.5 h-12 w-full rounded-2xl border-0 px-4 text-[16px] outline-none"
            />
          </label>
        </div>
        <button
          type="button"
          className="btn-primary"
          disabled={saving || !profileDirty}
          onClick={() => void saveProfile()}
        >
          Save profile
        </button>
      </section>

      <section className="catalog-stack mb-8">
        <h2 className="text-lg font-semibold">Access</h2>
        <AccessCascadePicker
          grant={access}
          onChange={setAccess}
          sites={sites}
          accounts={accounts}
          machines={machines}
          disabled={saving}
          legend={`Access for ${user.email}`}
        />
        <button
          type="button"
          className="btn-secondary"
          disabled={saving || !accessDirty}
          onClick={() => void saveAccess()}
        >
          Save access
        </button>
      </section>

      <section className="border-t border-white/10 pt-6">
        <h2 className="text-lg font-semibold text-[#f0c4c0]">Deactivate login</h2>
        <p className="text-muted mt-1 mb-4 text-sm">
          Removes sign-in access for this person. Data on this install is unchanged.
        </p>
        <button
          type="button"
          className="btn-soft text-[#f0c4c0]"
          disabled={saving}
          onClick={() => void deactivate()}
        >
          Deactivate
        </button>
      </section>
    </main>
  );
}
