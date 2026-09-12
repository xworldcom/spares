"use client";

import { useEffect, useState } from "react";
import { AccessCascadePicker } from "@/components/staff/AccessCascadePicker";
import { grantFromUser, normalizeAccessGrant, type AccessGrant } from "@/lib/access";
import {
  createPerson,
  listCustomerAccounts,
  listSites,
} from "@/lib/api/auth";
import { listMachines } from "@/lib/api/machines";
import { errorMessage } from "@/lib/api/errors";
import type { CustomerAccount, MachineSummary, Site } from "@/lib/api/types";

export function CreatePersonForm({
  onCreated,
  onCancel,
}: {
  onCreated?: () => void;
  onCancel?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [grant, setGrant] = useState<AccessGrant>(() => grantFromUser({}));
  const [sites, setSites] = useState<Site[]>([]);
  const [accounts, setAccounts] = useState<CustomerAccount[]>([]);
  const [machines, setMachines] = useState<MachineSummary[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listSites(), listCustomerAccounts(), listMachines()])
      .then(([nextSites, nextAccounts, nextMachines]) => {
        if (!cancelled) {
          setSites(nextSites);
          setAccounts(nextAccounts);
          setMachines(nextMachines);
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
    const normalized = normalizeAccessGrant(grant, machines);
    try {
      const user = await createPerson(email.trim(), password, normalized);
      setCreatedEmail(user.email);
      setEmail("");
      setPassword("");
      setGrant(grantFromUser({}));
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
        <p>Customer login — pick a customer, then site(s), then machine(s).</p>
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
          <p className="text-sm font-medium">Access</p>
          <div className="mt-2">
            <AccessCascadePicker
              grant={grant}
              onChange={setGrant}
              sites={sites}
              accounts={accounts}
              machines={machines}
              legend="New person access"
            />
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
