"use client";

import { useEffect, useState } from "react";
import { createSite, listSites } from "@/lib/api/auth";
import { errorMessage } from "@/lib/api/errors";
import type { Site } from "@/lib/api/types";
import { siteLabel } from "@/lib/access";

export function SitesPanel({
  reloadKey = 0,
  onChange,
}: {
  reloadKey?: number;
  onChange?: () => void;
}) {
  const [sites, setSites] = useState<Site[]>([]);
  const [company, setCompany] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSites()
      .then((next) => {
        if (!cancelled) {
          setSites(next);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(errorMessage(cause, "Could not load plants."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createSite(company, name);
      setCompany("");
      setName("");
      setAdding(false);
      const next = await listSites();
      setSites(next);
      onChange?.();
    } catch (cause) {
      setError(errorMessage(cause, "Could not add that plant."));
    } finally {
      setSubmitting(false);
    }
  }

  const grouped = new Map<string, Site[]>();
  for (const site of sites) {
    const rows = grouped.get(site.company) ?? [];
    rows.push(site);
    grouped.set(site.company, rows);
  }

  return (
    <section className="catalog-plants">
      <div className="catalog-plants-head">
        <div>
          <h2>Plants</h2>
          <p>Company plus location. People and machines both point here.</p>
        </div>
        <button
          type="button"
          className="btn-soft catalog-plants-add"
          aria-expanded={adding}
          onClick={() => setAdding((open) => !open)}
        >
          {adding ? "Close" : "Add plant"}
        </button>
      </div>
      {sites.length === 0 ? (
        <p className="spares-muted text-sm">No plants yet.</p>
      ) : (
        <ul className="catalog-plant-groups">
          {[...grouped.entries()].map(([companyName, rows]) => (
            <li key={companyName}>
              <p className="catalog-plant-company">{companyName}</p>
              <ul className="catalog-plant-chips">
                {rows.map((site) => (
                  <li key={site.id} className="catalog-plant-chip" title={siteLabel(site)}>
                    {site.name}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <form
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
          className="catalog-plants-form"
        >
          <label className="block text-sm font-medium">
            Company
            <input
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              required
              placeholder="Cargill"
              className="spares-field mt-1.5 h-11 w-full rounded-2xl border-0 px-3 text-[16px] outline-none"
            />
          </label>
          <label className="block text-sm font-medium">
            Plant
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              placeholder="Fort Worth"
              className="spares-field mt-1.5 h-11 w-full rounded-2xl border-0 px-3 text-[16px] outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary mt-auto inline-flex h-11 items-center justify-center rounded-full px-4 text-sm font-semibold disabled:opacity-60"
          >
            {submitting ? "Adding…" : "Save plant"}
          </button>
        </form>
      ) : null}
      {error ? (
        <p className="text-sm text-[#f0c4c0]" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
