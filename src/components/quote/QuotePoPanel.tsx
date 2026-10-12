"use client";

import { useState } from "react";
import { formatWhen } from "@/components/quote/quote-format";
import { canUploadPo, invoiceVisible, quoteIsStaffReadOnly, quotePoNextStep } from "@/lib/quotes";
import { quotePoUrl } from "@/lib/api/quotes";
import type { Quote, Role } from "@/types";

export function QuotePoPanel({
  quote,
  role,
  busy,
  onSaveNumber,
  onUpload,
}: {
  quote: Quote;
  role: Role;
  busy: boolean;
  onSaveNumber: (poNumber: string) => Promise<void>;
  onUpload: (input: { file: File; poNumber?: string }) => Promise<void>;
}) {
  const [poNumber, setPoNumber] = useState(quote.poNumber ?? "");
  const [file, setFile] = useState<File | null>(null);
  const readOnly = role === "staff" && quoteIsStaffReadOnly(quote.status);
  const allowed = canUploadPo(quote.status, role) && !readOnly;
  const nextStep = quotePoNextStep(quote.status, role);
  const downloadHref = quote.hasPoFile ? quotePoUrl(String(quote.number)) : null;

  return (
    <section className="spares-surface rounded-[24px] p-5">
      <h2 className="text-[19px] font-semibold tracking-tight">Purchase order</h2>
      {nextStep ? <p className="spares-muted mt-2 text-sm">{nextStep}</p> : null}

      {quote.poNumber || quote.hasPoFile ? (
        <p className="mt-3 text-sm">
          {quote.poNumber ? <span className="font-medium">{quote.poNumber}</span> : null}
          {quote.poOriginalFileName ? (
            <span className="spares-muted">
              {quote.poNumber ? " · " : ""}
              {quote.poOriginalFileName}
            </span>
          ) : null}
          {quote.poUploadedAt ? (
            <span className="spares-muted"> · {formatWhen(quote.poUploadedAt)}</span>
          ) : null}
        </p>
      ) : null}

      {downloadHref ? (
        <a
          href={downloadHref}
          className="btn-soft mt-3 inline-flex h-11 items-center rounded-full px-4 text-sm font-medium"
        >
          Download PDF
        </a>
      ) : null}

      {role === "staff" && allowed ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (poNumber.trim()) {
              void onSaveNumber(poNumber.trim());
            }
          }}
        >
          <label className="block text-sm font-medium">
            PO number (customer or internal)
            <input
              value={poNumber}
              onChange={(event) => setPoNumber(event.target.value)}
              className="spares-field mt-1.5 h-12 w-full rounded-2xl border-0 px-3 text-[16px] outline-none"
              placeholder="Customer PO"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !poNumber.trim()}
            className="btn-primary inline-flex h-12 items-center rounded-full px-5 text-[15px] font-semibold disabled:opacity-30"
          >
            Save PO number
          </button>
        </form>
      ) : null}

      {role === "customer" && allowed ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (file) {
              void onUpload({ file, poNumber: poNumber.trim() || undefined });
              return;
            }
            if (poNumber.trim()) {
              void onSaveNumber(poNumber.trim());
            }
          }}
        >
          <label className="block text-sm font-medium">
            PO number
            <input
              value={poNumber}
              onChange={(event) => setPoNumber(event.target.value)}
              className="spares-field mt-1.5 h-12 w-full rounded-2xl border-0 px-3 text-[16px] outline-none"
              placeholder="Your PO"
            />
          </label>
          <label className="block text-sm font-medium">
            PDF
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="mt-1.5 block w-full text-[15px] file:mr-3 file:h-11 file:rounded-full file:border-0 file:bg-[var(--spares-soft)] file:px-4 file:text-sm file:font-medium"
            />
          </label>
          <button
            type="submit"
            disabled={busy || (!file && !poNumber.trim())}
            className="btn-primary inline-flex h-12 items-center rounded-full px-5 text-[15px] font-semibold disabled:opacity-30"
          >
            {file ? "Upload PO" : "Save PO number"}
          </button>
        </form>
      ) : null}

      {role === "staff" && !quote.hasPoFile && allowed && invoiceVisible(quote.status) ? (
        <p className="spares-muted mt-3 text-sm">Waiting for the customer PDF.</p>
      ) : null}
    </section>
  );
}
