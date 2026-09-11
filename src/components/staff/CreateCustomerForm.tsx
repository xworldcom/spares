"use client";

import { useEffect, useState } from "react";
import { createCustomer, listSites } from "@/lib/api/auth";
import { errorMessage } from "@/lib/api/errors";
import type { Site } from "@/lib/api/types";
import { accessOptions, parseAccessValue } from "@/lib/access";

export function CreateCustomerForm({
  onCreated,
}: {
  onCreated?: () => void;
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
      className="spares-surface max-w-md space-y-4 rounded-[24px] p-5"
    >
      <div>
        <label htmlFor="customer-email" className="block text-sm font-medium">
          Customer email
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
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="spares-field mt-1.5 h-12 w-full rounded-2xl border-0 px-4 text-[16px] outline-none"
        />
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
        <p className="spares-muted mt-1.5 text-sm">
          One plant, or All plants at that company for corporate users.
        </p>
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
      <button
        type="submit"
        disabled={submitting}
        className="btn-primary inline-flex h-12 w-full items-center justify-center rounded-full text-[16px] font-semibold disabled:opacity-60 sm:w-auto sm:px-5"
      >
        {submitting ? "Creating…" : "Create customer"}
      </button>
    </form>
  );
}
