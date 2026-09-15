"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { CatalogSearch } from "@/components/catalog/CatalogSearch";
import { CatalogSkeleton } from "@/components/catalog/CatalogSkeleton";
import { PersonGlyph } from "@/components/catalog/CatalogGlyph";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import {
  AccessCascadePicker,
  grantFromPublicUser,
} from "@/components/staff/AccessCascadePicker";
import {
  accessSummary,
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
import { apiFetch } from "@/lib/api/client";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";
import type { CustomerAccount, MachineSummary, PublicUser, Site } from "@/lib/api/types";
import { catalogQueryMatch } from "@/lib/ui/catalog-query";
import { displayPersonName } from "@/lib/ui/display-name";

type PersonProfile = {
  name: string;
  email: string;
};

function grantsEqual(left: AccessGrant, right: AccessGrant) {
  const leftSites = [...left.siteIds].sort().join(",");
  const rightSites = [...right.siteIds].sort().join(",");
  const leftMachines = [...left.machineIds].sort().join(",");
  const rightMachines = [...right.machineIds].sort().join(",");
  return leftSites === rightSites && leftMachines === rightMachines;
}

function profileFromUser(user: PublicUser): PersonProfile {
  return {
    name: user.name?.trim() ?? "",
    email: user.email,
  };
}

function profilesEqual(left: PersonProfile, right: PersonProfile) {
  return left.name.trim() === right.name.trim() && left.email.trim() === right.email.trim();
}

type PlatformStaffRow = {
  id: string;
  email: string;
  tenantId: string | null;
  tenantName: string | null;
};

export function PeopleList({ reloadKey = 0 }: { reloadKey?: number }) {
  const { user } = useAuth();
  const [people, setPeople] = useState<PublicUser[]>([]);
  const [platformStaff, setPlatformStaff] = useState<PlatformStaffRow[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [accounts, setAccounts] = useState<CustomerAccount[]>([]);
  const [machines, setMachines] = useState<MachineSummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draftAccess, setDraftAccess] = useState<Record<string, AccessGrant>>({});
  const [draftProfile, setDraftProfile] = useState<Record<string, PersonProfile>>({});

  useEffect(() => {
    let cancelled = false;
    const loads: Promise<unknown>[] = [
      listCustomers(),
      listSites(),
      listCustomerAccounts(),
      listMachines(),
    ];
    if (user?.platformOwner) {
      loads.push(
        apiFetch<{ staff: PlatformStaffRow[] }>("/api/platform/staff").then(
          (data) => data.staff,
        ),
      );
    }
    Promise.all(loads)
      .then((results) => {
        if (cancelled) {
          return;
        }
        const [nextPeople, nextSites, nextAccounts, nextMachines, nextStaff] = results as [
          PublicUser[],
          Site[],
          CustomerAccount[],
          MachineSummary[],
          PlatformStaffRow[] | undefined,
        ];
        setPeople(nextPeople);
        setSites(nextSites);
        setAccounts(nextAccounts);
        setMachines(nextMachines);
        setPlatformStaff(nextStaff ?? []);
        setDraftAccess(
          Object.fromEntries(
            nextPeople.map((row) => [row.id, grantFromPublicUser(row)]),
          ),
        );
        setDraftProfile(
          Object.fromEntries(nextPeople.map((row) => [row.id, profileFromUser(row)])),
        );
        setError(null);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        setError(errorMessage(cause, "Could not load people."));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey, retryKey, user?.platformOwner]);

  const filtered = useMemo(() => {
    return people.filter((row) =>
      catalogQueryMatch(query, [
        displayPersonName(row),
        row.email,
        accessSummary(row, accounts, sites, machines),
      ]),
    );
  }, [people, query, accounts, sites, machines]);

  async function saveAccess(userId: string) {
    setSavingId(userId);
    setError(null);
    const grant = normalizeAccessGrant(draftAccess[userId] ?? grantFromUser({}), machines);
    try {
      const next = await updatePersonAccess(userId, grant);
      setPeople((current) => current.map((row) => (row.id === userId ? next : row)));
      setDraftAccess((current) => ({
        ...current,
        [userId]: grantFromPublicUser(next),
      }));
    } catch (cause) {
      setError(errorMessage(cause, "Could not update access."));
    } finally {
      setSavingId(null);
    }
  }

  async function saveProfile(userId: string) {
    setSavingId(userId);
    setError(null);
    const draft = draftProfile[userId] ?? profileFromUser(people.find((row) => row.id === userId)!);
    const trimmedName = draft.name.trim();
    const trimmedEmail = draft.email.trim();
    if (!trimmedEmail) {
      setError("Email is required.");
      setSavingId(null);
      return;
    }
    try {
      const next = await updatePersonProfile(userId, {
        email: trimmedEmail,
        name: trimmedName || null,
      });
      setPeople((current) => current.map((row) => (row.id === userId ? next : row)));
      setDraftProfile((current) => ({
        ...current,
        [userId]: profileFromUser(next),
      }));
    } catch (cause) {
      setError(errorMessage(cause, "Could not update profile."));
    } finally {
      setSavingId(null);
    }
  }

  async function removePerson(userId: string, email: string) {
    if (!window.confirm(`Remove ${email}? They will lose login access.`)) {
      return;
    }
    setSavingId(userId);
    setError(null);
    try {
      await deletePerson(userId);
      setPeople((current) => current.filter((row) => row.id !== userId));
    } catch (cause) {
      setError(errorMessage(cause, "Could not remove that person."));
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <section className="catalog-stack">
        <CatalogSkeleton variant="person" count={5} />
      </section>
    );
  }

  if (error && people.length === 0) {
    return (
      <ErrorState
        title="Failed to load people"
        message={error}
        onRetry={() => {
          setLoading(true);
          setRetryKey((key) => key + 1);
        }}
      />
    );
  }

  return (
    <section className="catalog-stack">
      {user?.platformOwner && platformStaff.length > 0 ? (
        <div className="card p-4 mb-4">
          <h2 className="text-base font-semibold mb-2">Staff tenant ids</h2>
          <p className="text-sm text-muted mb-3">
            Customer rows below are site access only. Staff logins must not use{" "}
            <code>{DEFAULT_TENANT_ID}</code> unless they belong to OEE360 Host.
          </p>
          <ul className="stack gap-2 text-sm">
            {platformStaff.map((row) => (
              <li key={row.id}>
                <span className="font-medium">{row.email}</span>
                <span className="text-muted">
                  {" "}
                  · {row.tenantName ?? "—"} ·{" "}
                  <code className="text-xs">{row.tenantId ?? "missing"}</code>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="catalog-toolbar">
        <CatalogSearch
          id="people-search"
          label="Search people"
          value={query}
          onChange={setQuery}
          placeholder="Search name, email, or access"
        />
        <p className="catalog-count">
          {filtered.length} {filtered.length === 1 ? "person" : "people"}
        </p>
      </div>
      {error ? (
        <p className="text-sm text-[#f0c4c0]" role="alert">
          {error}
        </p>
      ) : null}
      {filtered.length === 0 ? (
        <div className="catalog-empty">
          <EmptyState
            title={people.length === 0 ? "No people yet" : "No matches"}
            message={
              people.length === 0
                ? "Create a person with New person. Assign customer, site, and machine access."
                : "Try a different name, email, or access label."
            }
          />
        </div>
      ) : (
        <ul className="catalog-people-list">
          <li className="catalog-people-head" aria-hidden="true">
            <span>Person</span>
            <span>Contact</span>
            <span>Access</span>
          </li>
          {filtered.map((row) => {
            const savedProfile = profileFromUser(row);
            const draftPerson = draftProfile[row.id] ?? savedProfile;
            const displayName = displayPersonName({
              name: draftPerson.name,
              email: draftPerson.email,
            });
            const savedGrant = grantFromPublicUser(row);
            const draft = draftAccess[row.id] ?? savedGrant;
            const summary = accessSummary(draft, accounts, sites, machines);
            const accessDirty = !grantsEqual(
              normalizeAccessGrant(draft, machines),
              normalizeAccessGrant(savedGrant, machines),
            );
            const profileDirty = !profilesEqual(draftPerson, savedProfile);
            return (
              <li key={row.id} className="catalog-person-card catalog-person-card-tall">
                <div className="catalog-person-who">
                  <PersonGlyph email={row.email} />
                  <div className="min-w-0">
                    <p className="catalog-person-name">{displayName}</p>
                    <p className="catalog-person-email catalog-person-email-mobile">
                      {draftPerson.email}
                    </p>
                    <p className="catalog-person-plant-mobile">{summary || "No access"}</p>
                  </div>
                </div>
                <div className="catalog-person-contact">
                  <label className="catalog-person-field">
                    <span className="catalog-person-field-label">Name</span>
                    <input
                      value={draftPerson.name}
                      disabled={savingId === row.id}
                      placeholder={displayPersonName({ email: draftPerson.email })}
                      onChange={(event) =>
                        setDraftProfile((current) => ({
                          ...current,
                          [row.id]: { ...draftPerson, name: event.target.value },
                        }))
                      }
                      className="spares-field h-11 w-full rounded-2xl border-0 px-3 text-[15px] outline-none"
                    />
                  </label>
                  <label className="catalog-person-field">
                    <span className="catalog-person-field-label">Email</span>
                    <input
                      type="email"
                      value={draftPerson.email}
                      disabled={savingId === row.id}
                      onChange={(event) =>
                        setDraftProfile((current) => ({
                          ...current,
                          [row.id]: { ...draftPerson, email: event.target.value },
                        }))
                      }
                      className="spares-field h-11 w-full rounded-2xl border-0 px-3 text-[15px] outline-none"
                    />
                  </label>
                  <button
                    type="button"
                    className="btn-soft"
                    disabled={savingId === row.id || !profileDirty}
                    onClick={() => void saveProfile(row.id)}
                  >
                    Save details
                  </button>
                </div>
                <div className="catalog-person-access catalog-person-access-wide">
                  <p className="catalog-person-access-summary">{summary || "No access"}</p>
                  <AccessCascadePicker
                    grant={draft}
                    onChange={(next) =>
                      setDraftAccess((current) => ({ ...current, [row.id]: next }))
                    }
                    sites={sites}
                    accounts={accounts}
                    machines={machines}
                    disabled={savingId === row.id}
                    legend={`Access for ${row.email}`}
                  />
                  <div className="catalog-person-actions">
                    <button
                      type="button"
                      className="btn-soft"
                      disabled={savingId === row.id || !accessDirty}
                      onClick={() => void saveAccess(row.id)}
                    >
                      Save access
                    </button>
                    <button
                      type="button"
                      className="btn-soft text-[#f0c4c0]"
                      disabled={savingId === row.id}
                      onClick={() => void removePerson(row.id, row.email)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
