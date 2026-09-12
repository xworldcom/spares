"use client";

import { useEffect, useMemo, useState } from "react";
import { CatalogSearch } from "@/components/catalog/CatalogSearch";
import { CatalogSkeleton } from "@/components/catalog/CatalogSkeleton";
import { PersonGlyph } from "@/components/catalog/CatalogGlyph";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { accessOptionsGrouped, accessSummary, siteLabel } from "@/lib/access";
import {
  deletePerson,
  listCustomerAccounts,
  listCustomers,
  listSites,
  updatePersonSites,
} from "@/lib/api/auth";
import { errorMessage } from "@/lib/api/errors";
import type { CustomerAccount, PublicUser, Site } from "@/lib/api/types";
import { catalogQueryMatch } from "@/lib/ui/catalog-query";
import { displayNameFromEmail } from "@/lib/ui/display-name";

export function PeopleList({ reloadKey = 0 }: { reloadKey?: number }) {
  const [people, setPeople] = useState<PublicUser[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [accounts, setAccounts] = useState<CustomerAccount[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draftAccess, setDraftAccess] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all([listCustomers(), listSites(), listCustomerAccounts()])
      .then(([nextPeople, nextSites, nextAccounts]) => {
        if (cancelled) {
          return;
        }
        setPeople(nextPeople);
        setSites(nextSites);
        setAccounts(nextAccounts);
        setDraftAccess(
          Object.fromEntries(nextPeople.map((row) => [row.id, row.siteIds ?? []])),
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

  const groupedSites = useMemo(
    () => accessOptionsGrouped(sites, accounts),
    [sites, accounts],
  );

  const filtered = useMemo(() => {
    return people.filter((row) =>
      catalogQueryMatch(query, [
        displayNameFromEmail(row.email),
        row.email,
        accessSummary(row, accounts),
        ...(row.sites ?? []).map((site) => siteLabel(site, accounts)),
      ]),
    );
  }, [people, query, accounts]);

  function toggleSite(userId: string, siteId: string) {
    setDraftAccess((current) => {
      const selected = new Set(current[userId] ?? []);
      if (selected.has(siteId)) {
        selected.delete(siteId);
      } else {
        selected.add(siteId);
      }
      return { ...current, [userId]: [...selected] };
    });
  }

  async function saveAccess(userId: string) {
    setSavingId(userId);
    setError(null);
    try {
      const next = await updatePersonSites(userId, draftAccess[userId] ?? []);
      setPeople((current) => current.map((row) => (row.id === userId ? next : row)));
      setDraftAccess((current) => ({ ...current, [userId]: next.siteIds ?? [] }));
    } catch (cause) {
      setError(errorMessage(cause, "Could not update site access."));
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
          placeholder="Search name, email, or site"
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
                ? "Create a person with New person. Assign one or more sites for machine and ticket access."
                : "Try a different name, email, or site."
            }
          />
        </div>
      ) : (
        <ul className="catalog-people-list">
          <li className="catalog-people-head" aria-hidden="true">
            <span>Person</span>
            <span>Contact</span>
            <span>Current access</span>
            <span>Sites</span>
          </li>
          {filtered.map((row) => {
            const name = displayNameFromEmail(row.email);
            const selected = new Set(draftAccess[row.id] ?? []);
            const summary = accessSummary(
              { siteIds: [...selected], sites: sites.filter((site) => selected.has(site.id)) },
              accounts,
            );
            return (
              <li key={row.id} className="catalog-person-card catalog-person-card-tall">
                <div className="catalog-person-who">
                  <PersonGlyph email={row.email} />
                  <div className="min-w-0">
                    <p className="catalog-person-name">{name}</p>
                    <p className="catalog-person-email catalog-person-email-mobile">{row.email}</p>
                    <p className="catalog-person-plant-mobile">{summary || "No site access"}</p>
                  </div>
                </div>
                <p className="catalog-person-email catalog-person-email-desktop">{row.email}</p>
                <p className="catalog-person-plant-desktop">{summary || "No site access"}</p>
                <div className="catalog-person-access catalog-person-access-wide">
                  <fieldset className="catalog-site-picker">
                    <legend className="sr-only">Sites for {row.email}</legend>
                    {groupedSites.map((group) => (
                      <div key={group.customerName} className="catalog-site-picker-group">
                        <p className="catalog-site-picker-customer">{group.customerName}</p>
                        <ul className="catalog-site-picker-options">
                          {group.sites.map((site) => (
                            <li key={site.id}>
                              <label className="catalog-site-picker-option">
                                <input
                                  type="checkbox"
                                  checked={selected.has(site.id)}
                                  disabled={savingId === row.id}
                                  onChange={() => toggleSite(row.id, site.id)}
                                />
                                <span>{site.name}</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </fieldset>
                  <div className="catalog-person-actions">
                    <button
                      type="button"
                      className="btn-soft"
                      disabled={savingId === row.id}
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
