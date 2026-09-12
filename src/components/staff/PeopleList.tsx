"use client";

import { useEffect, useMemo, useState } from "react";
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
} from "@/lib/api/auth";
import { listMachines } from "@/lib/api/machines";
import { errorMessage } from "@/lib/api/errors";
import type { CustomerAccount, MachineSummary, PublicUser, Site } from "@/lib/api/types";
import { catalogQueryMatch } from "@/lib/ui/catalog-query";
import { displayNameFromEmail } from "@/lib/ui/display-name";

function grantsEqual(left: AccessGrant, right: AccessGrant) {
  const leftSites = [...left.siteIds].sort().join(",");
  const rightSites = [...right.siteIds].sort().join(",");
  const leftMachines = [...left.machineIds].sort().join(",");
  const rightMachines = [...right.machineIds].sort().join(",");
  return leftSites === rightSites && leftMachines === rightMachines;
}

export function PeopleList({ reloadKey = 0 }: { reloadKey?: number }) {
  const [people, setPeople] = useState<PublicUser[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [accounts, setAccounts] = useState<CustomerAccount[]>([]);
  const [machines, setMachines] = useState<MachineSummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draftAccess, setDraftAccess] = useState<Record<string, AccessGrant>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all([listCustomers(), listSites(), listCustomerAccounts(), listMachines()])
      .then(([nextPeople, nextSites, nextAccounts, nextMachines]) => {
        if (cancelled) {
          return;
        }
        setPeople(nextPeople);
        setSites(nextSites);
        setAccounts(nextAccounts);
        setMachines(nextMachines);
        setDraftAccess(
          Object.fromEntries(
            nextPeople.map((row) => [row.id, grantFromPublicUser(row)]),
          ),
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
  }, [reloadKey, retryKey]);

  const filtered = useMemo(() => {
    return people.filter((row) =>
      catalogQueryMatch(query, [
        displayNameFromEmail(row.email),
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
            const name = displayNameFromEmail(row.email);
            const savedGrant = grantFromPublicUser(row);
            const draft = draftAccess[row.id] ?? savedGrant;
            const summary = accessSummary(draft, accounts, sites, machines);
            const dirty = !grantsEqual(
              normalizeAccessGrant(draft, machines),
              normalizeAccessGrant(savedGrant, machines),
            );
            return (
              <li key={row.id} className="catalog-person-card catalog-person-card-tall">
                <div className="catalog-person-who">
                  <PersonGlyph email={row.email} />
                  <div className="min-w-0">
                    <p className="catalog-person-name">{name}</p>
                    <p className="catalog-person-email catalog-person-email-mobile">{row.email}</p>
                    <p className="catalog-person-plant-mobile">{summary || "No access"}</p>
                  </div>
                </div>
                <p className="catalog-person-email catalog-person-email-desktop">{row.email}</p>
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
                      disabled={savingId === row.id || !dirty}
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
