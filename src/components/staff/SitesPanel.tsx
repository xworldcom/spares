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
    <section className="spares-surface space-y-3 rounded-[24px] p-5">
      <div>
        <h2 className="text-[19px] font-semibold tracking-tight">Plants</h2>
        <p className="spares-muted mt-1 text-sm">
          A plant is a company plus a location. People and machines both point
          here. Corporate users pick All plants for their company.
        </p>
      </div>
      {sites.length === 0 ? (
        <p className="spares-muted text-sm">No plants yet.</p>
      ) : (
        <ul className="space-y-3">
          {[...grouped.entries()].map(([companyName, rows]) => (
            <li key={companyName}>
              <p className="text-[13px] font-semibold tracking-tight">
                {companyName}
              </p>
              <ul className="mt-1 space-y-1">
                {rows.map((site) => (
                  <li key={site.id} className="text-sm">
                    {site.name}
                    <span className="spares-muted ml-2 text-[12px]">
                      {siteLabel(site)}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
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
          className="btn-soft mt-auto inline-flex h-11 items-center justify-center rounded-full px-4 text-sm font-semibold disabled:opacity-60"
        >
          {submitting ? "Adding…" : "Add plant"}
        </button>
      </form>
      {error ? (
        <p className="text-sm text-[#f0c4c0]" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
