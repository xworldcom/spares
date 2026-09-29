"use client";

import Link from "next/link";
import { useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import {
  ACCESS_INQUIRY_CUSTOMER_TYPES,
  accessInquiryCustomerTypeLabel,
} from "@/lib/access-inquiry";

type FormState = {
  fullName: string;
  workEmail: string;
  phone: string;
  companyName: string;
  website: string;
  roleTitle: string;
  scaleNotes: string;
  customerType: (typeof ACCESS_INQUIRY_CUSTOMER_TYPES)[number] | "";
  message: string;
  referralNotes: string;
  company_fax: string;
};

const INITIAL: FormState = {
  fullName: "",
  workEmail: "",
  phone: "",
  companyName: "",
  website: "",
  roleTitle: "",
  scaleNotes: "",
  customerType: "",
  message: "",
  referralNotes: "",
  company_fax: "",
};

export function InquireForm() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch<{ ok: boolean; message?: string }>("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setSuccess(response.message ?? "Inquiry received.");
      setForm(INITIAL);
    } catch (cause) {
      setError(errorMessage(cause, "Could not send inquiry. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div className="inquire-success" role="status">
        <h1 className="inquire-title">Inquiry sent</h1>
        <p className="inquire-lede">{success}</p>
        <Link href="/" className="landing-cta inquire-back">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form className="inquire-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
      <header className="inquire-header">
        <h1 className="inquire-title">Request access</h1>
        <p className="inquire-lede">
          We review each request. This form does not create a login.
        </p>
      </header>

      <div className="inquire-grid">
        <label className="inquire-field">
          <span>Full name</span>
          <input
            className="login-input"
            autoComplete="name"
            required
            value={form.fullName}
            onChange={(event) => update("fullName", event.target.value)}
          />
        </label>
        <label className="inquire-field">
          <span>Work email</span>
          <input
            className="login-input"
            type="email"
            autoComplete="email"
            required
            value={form.workEmail}
            onChange={(event) => update("workEmail", event.target.value)}
          />
        </label>
        <label className="inquire-field">
          <span>Phone</span>
          <input
            className="login-input"
            type="tel"
            autoComplete="tel"
            required
            value={form.phone}
            onChange={(event) => update("phone", event.target.value)}
          />
        </label>
        <label className="inquire-field">
          <span>Role</span>
          <input
            className="login-input"
            autoComplete="organization-title"
            required
            value={form.roleTitle}
            onChange={(event) => update("roleTitle", event.target.value)}
          />
        </label>
        <label className="inquire-field inquire-field--wide">
          <span>Company</span>
          <input
            className="login-input"
            autoComplete="organization"
            required
            value={form.companyName}
            onChange={(event) => update("companyName", event.target.value)}
          />
        </label>
        <label className="inquire-field">
          <span>Company website</span>
          <input
            className="login-input"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={form.website}
            onChange={(event) => update("website", event.target.value)}
          />
        </label>
        <label className="inquire-field inquire-field--wide">
          <span>Plants and machines (optional)</span>
          <input
            className="login-input"
            placeholder="3 plants, 40 lines"
            value={form.scaleNotes}
            onChange={(event) => update("scaleNotes", event.target.value)}
          />
        </label>
        <label className="inquire-field inquire-field--wide">
          <span>Company type</span>
          <select
            className="login-input inquire-select"
            required
            value={form.customerType}
            onChange={(event) =>
              update(
                "customerType",
                event.target.value as FormState["customerType"],
              )
            }
          >
            <option value="" disabled>
              Select one
            </option>
            {ACCESS_INQUIRY_CUSTOMER_TYPES.map((type) => (
              <option key={type} value={type}>
                {accessInquiryCustomerTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <label className="inquire-field inquire-field--wide">
          <span>What do you need?</span>
          <textarea
            className="login-input inquire-textarea"
            required
            rows={4}
            value={form.message}
            onChange={(event) => update("message", event.target.value)}
          />
        </label>
        <label className="inquire-field inquire-field--wide">
          <span>Referral (optional)</span>
          <input
            className="login-input"
            value={form.referralNotes}
            onChange={(event) => update("referralNotes", event.target.value)}
          />
        </label>
      </div>

      <div className="inquire-honeypot" aria-hidden="true">
        <label>
          Fax
          <input
            tabIndex={-1}
            autoComplete="off"
            value={form.company_fax}
            onChange={(event) => update("company_fax", event.target.value)}
          />
        </label>
      </div>

      {error ? (
        <p className="inquire-error" role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" className="login-submit inquire-submit" disabled={busy}>
        {busy ? "Sending…" : "Submit inquiry"}
      </button>
      <p className="inquire-foot">
        Already invited?{" "}
        <Link href="/" className="inquire-link">
          Sign in here
        </Link>
        .
      </p>
    </form>
  );
}
