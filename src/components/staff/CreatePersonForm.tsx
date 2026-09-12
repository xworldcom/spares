"use client";

import { useEffect, useState } from "react";
import { createPerson, listSites } from "@/lib/api/auth";
import { errorMessage } from "@/lib/api/errors";
import type { Site } from "@/lib/api/types";
import { accessOptionsGrouped } from "@/lib/access";

export function CreatePersonForm({
  onCreated,
  onCancel,
}: {
  onCreated?: () => void;
  onCancel?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [siteIds, setSiteIds] = useState<string[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSites()
      .then((next) => {
        if (!cancelled) {
          setSites(next);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = accessOptionsGrouped(sites);

  function toggleSite(siteId: string) {
    setSiteIds((current) =>
      current.includes(siteId)
        ? current.filter((id) => id !== siteId)
        : [...current, siteId],
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCreatedEmail(null);
    setSubmitting(true);
    try {
      const user = await createPerson(email.trim(), password, siteIds);
      setCreatedEmail(user.email);
      setEmail("");
      setPassword("");
      setSiteIds([]);
      onCreated?.();
    } catch (cause) {
      setError(errorMessage(cause, "Could not create that person."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="catalog-create"
    >
      <div className="catalog-create-copy">
        <h2>New person</h2>
        <p>Customer login — assign one or more sites for machine and ticket access.</p>
      </div>
      <div className="catalog-create-grid">
        <div>
          <label htmlFor="person-email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="person-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="spares-field mt-1.5 h-12 w-full rounded-2xl border-0 px-4 text-[16px] outline-none"
          />
        </div>
        <div>
          <label htmlFor="person-password" className="block text-sm font-medium">
            Temporary password
          </label>
          <input
            id="person-password"
            name="password"
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
        <div className="md:col-span-2">
          <p className="text-sm font-medium">Site access</p>
          <div className="catalog-site-picker mt-2">
            {grouped.map((group) => (
              <div key={group.customerName} className="catalog-site-picker-group">
                <p className="catalog-site-picker-customer">{group.customerName}</p>
                <ul className="catalog-site-picker-options">
                  {group.sites.map((site) => (
                    <li key={site.id}>
                      <label className="catalog-site-picker-option">
                        <input
                          type="checkbox"
                          checked={siteIds.includes(site.id)}
                          onChange={() => toggleSite(site.id)}
                        />
                        <span>{site.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
      {error ? (
        <p className="text-sm text-[#f0c4c0]" role="alert">
          {error}
        </p>
      ) : null}
      {createdEmail ? (
        <p className="text-sm text-[#8ee0a8]" role="status">
          Created {createdEmail}. They can sign in on the same login screen.
        </p>
      ) : null}
      <div className="catalog-create-actions">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="btn-soft inline-flex h-12 items-center justify-center rounded-full px-5 text-[15px] font-semibold"
          >
            Cancel
          </button>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className="btn-primary inline-flex h-12 items-center justify-center rounded-full px-5 text-[16px] font-semibold disabled:opacity-60"
        >
          {submitting ? "Creating…" : "Create person"}
        </button>
      </div>
    </form>
  );
}
