"use client";

import { useState } from "react";
import { createCustomer } from "@/lib/api/auth";
import { errorMessage } from "@/lib/api/errors";

export function CreateCustomerForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCreatedEmail(null);
    setSubmitting(true);
    try {
      const user = await createCustomer(email.trim(), password);
      setCreatedEmail(user.email);
      setEmail("");
      setPassword("");
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
      className="max-w-md space-y-4 rounded-lg border border-neutral-200 bg-white p-5"
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
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
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
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
      </div>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {createdEmail ? (
        <p className="text-sm text-green-800" role="status">
          Created customer {createdEmail}. They can sign in on the same login
          screen.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={submitting}
        className="btn-primary rounded-full px-4 py-2 text-sm font-medium disabled:opacity-60"
      >
        {submitting ? "Creating…" : "Create customer"}
      </button>
    </form>
  );
}
