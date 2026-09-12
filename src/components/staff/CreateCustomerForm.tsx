"use client";

import { useEffect, useState } from "react";
import { createCustomer, listSites } from "@/lib/api/auth";
import { errorMessage } from "@/lib/api/errors";
import type { Site } from "@/lib/api/types";
import { accessOptions, parseAccessValue } from "@/lib/access";

export function CreateCustomerForm({
  onCreated,
  onCancel,
}: {
  onCreated?: () => void;
  onCancel?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [siteId, setSiteId] = useState("");
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCreatedEmail(null);
    setSubmitting(true);
    try {
      const user = await createCustomer(
        email.trim(),
        password,
        parseAccessValue(siteId),
      );
      setCreatedEmail(user.email);
      setEmail("");
      setPassword("");
      onCreated?.();
    } catch (cause) {
      setError(errorMessage(cause, "Could not create the customer account."));
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
        <h2>New customer</h2>
        <p>They use the same login screen. Give a plant, or all plants at their company.</p>
      </div>
      <div className="catalog-create-grid">
        <div>
          <label htmlFor="customer-email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="customer-email"
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
          <label htmlFor="customer-password" className="block text-sm font-medium">
            Temporary password
          </label>
          <input
            id="customer-password"
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
        <div>
          <label htmlFor="customer-site" className="block text-sm font-medium">
            Access
          </label>
          <select
            id="customer-site"
            value={siteId}
            onChange={(event) => setSiteId(event.target.value)}
            className="spares-field mt-1.5 h-12 w-full rounded-2xl border-0 px-4 text-[16px] outline-none"
          >
            <option value="">No access</option>
            {accessOptions(sites).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error ? (
        <p className="text-sm text-[#f0c4c0]" role="alert">
          {error}
        </p>
      ) : null}
      {createdEmail ? (
        <p className="text-sm text-[#8ee0a8]" role="status">
          Created customer {createdEmail}. They can sign in on the same login
          screen.
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
          {submitting ? "Creating…" : "Create customer"}
        </button>
      </div>
    </form>
  );
}
