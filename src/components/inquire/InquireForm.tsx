"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { inquireKeyboardInset, inquireRevealDelta } from "@/lib/ui/inquire-focus";
import {
  ACCESS_INQUIRY_CUSTOMER_TYPES,
  ACCESS_INQUIRY_FIELDS,
  accessInquiryCustomerTypeLabel,
  accessInquiryFieldErrors,
  accessInquiryFieldForMessage,
  type AccessInquiryField,
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

function FieldError({ name, message }: { name: AccessInquiryField; message?: string }) {
  if (!message) {
    return null;
  }
  return (
    <span id={`inquire-${name}-error`} className="inquire-field-error">
      {message}
    </span>
  );
}

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
  const formRef = useRef<HTMLFormElement>(null);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<AccessInquiryField, string>>>({});
  const [success, setSuccess] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (!ACCESS_INQUIRY_FIELDS.includes(key as AccessInquiryField)) {
      return;
    }
    setFieldErrors((prev) => {
      if (!prev[key as AccessInquiryField]) {
        return prev;
      }
      const next = { ...prev };
      delete next[key as AccessInquiryField];
      return next;
    });
  }

  useEffect(() => {
    const formEl = formRef.current;
    if (!formEl) {
      return;
    }
    const root = document.documentElement;
    const headerHeight = () =>
      document.querySelector(".spares-header")?.getBoundingClientRect().height ?? 56;

    function reveal() {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !formEl.contains(active)) {
        return;
      }
      if (active === formEl) {
        return;
      }
      const viewport = window.visualViewport;
      const offsetTop = viewport?.offsetTop ?? 0;
      const visibleTop = offsetTop + headerHeight() + 8;
      const visibleBottom = (viewport ? offsetTop + viewport.height : window.innerHeight) - 12;
      const delta = inquireRevealDelta(active.getBoundingClientRect(), visibleTop, visibleBottom);
      if (delta !== 0) {
        window.scrollBy({ top: delta });
      }
    }

    function syncInset() {
      const viewport = window.visualViewport;
      const inset = viewport
        ? inquireKeyboardInset(window.innerHeight, viewport.height, viewport.offsetTop)
        : 0;
      root.style.setProperty("--inquire-keyboard", `${inset}px`);
      reveal();
    }

    syncInset();
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", syncInset);
    viewport?.addEventListener("scroll", syncInset);
    formEl.addEventListener("focusin", reveal);
    return () => {
      viewport?.removeEventListener("resize", syncInset);
      viewport?.removeEventListener("scroll", syncInset);
      formEl.removeEventListener("focusin", reveal);
      root.style.removeProperty("--inquire-keyboard");
    };
  }, []);

  function invalidProps(name: AccessInquiryField) {
    const message = fieldErrors[name];
    return {
      id: `inquire-${name}`,
      "aria-invalid": message ? (true as const) : undefined,
      "aria-describedby": message ? `inquire-${name}-error` : undefined,
    };
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const invalid = accessInquiryFieldErrors(form);
    const firstInvalid = ACCESS_INQUIRY_FIELDS.find((field) => invalid[field]);
    if (firstInvalid) {
      setFieldErrors(invalid);
      setError("Check the highlighted fields.");
      setBusy(false);
      document.getElementById(`inquire-${firstInvalid}`)?.focus();
      return;
    }
    setFieldErrors({});
    try {
      const response = await apiFetch<{ ok: boolean; message?: string }>("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setSuccess(response.message ?? "Inquiry received.");
      setForm(INITIAL);
    } catch (cause) {
      const message = errorMessage(cause, "Could not send inquiry. Try again.");
      setError(message);
      const field = accessInquiryFieldForMessage(message);
      setFieldErrors(field ? { [field]: message } : {});
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
    <form
      ref={formRef}
      className="inquire-form"
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
    >
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
            {...invalidProps("fullName")}
            value={form.fullName}
            onChange={(event) => update("fullName", event.target.value)}
          />
          <FieldError name="fullName" message={fieldErrors.fullName} />
        </label>
        <label className="inquire-field">
          <span>Work email</span>
          <input
            className="login-input"
            type="email"
            autoComplete="email"
            required
            {...invalidProps("workEmail")}
            value={form.workEmail}
            onChange={(event) => update("workEmail", event.target.value)}
          />
          <FieldError name="workEmail" message={fieldErrors.workEmail} />
        </label>
        <label className="inquire-field">
          <span>Phone</span>
          <input
            className="login-input"
            type="tel"
            autoComplete="tel"
            required
            {...invalidProps("phone")}
            value={form.phone}
            onChange={(event) => update("phone", event.target.value)}
          />
          <FieldError name="phone" message={fieldErrors.phone} />
        </label>
        <label className="inquire-field">
          <span>Role</span>
          <input
            className="login-input"
            autoComplete="organization-title"
            required
            {...invalidProps("roleTitle")}
            value={form.roleTitle}
            onChange={(event) => update("roleTitle", event.target.value)}
          />
          <FieldError name="roleTitle" message={fieldErrors.roleTitle} />
        </label>
        <label className="inquire-field inquire-field--wide">
          <span>Company</span>
          <input
            className="login-input"
            autoComplete="organization"
            required
            {...invalidProps("companyName")}
            value={form.companyName}
            onChange={(event) => update("companyName", event.target.value)}
          />
          <FieldError name="companyName" message={fieldErrors.companyName} />
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
            {...invalidProps("customerType")}
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
          <FieldError name="customerType" message={fieldErrors.customerType} />
        </label>
        <label className="inquire-field inquire-field--wide">
          <span>What do you need?</span>
          <textarea
            className="login-input inquire-textarea"
            required
            rows={4}
            {...invalidProps("message")}
            value={form.message}
            onChange={(event) => update("message", event.target.value)}
          />
          <FieldError name="message" message={fieldErrors.message} />
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
