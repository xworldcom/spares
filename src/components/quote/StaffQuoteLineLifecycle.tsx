"use client";

import { useEffect, useMemo, useState } from "react";
import { PartLifecycleNotice } from "@/components/part-lifecycle/PartLifecycleNotice";
import { partLifecycleStatusLabel } from "@/lib/part-lifecycle-copy";
import { saveStaffPartLifecycle } from "@/lib/api/part-lifecycle";
import { errorMessage } from "@/lib/api/errors";
import type { PartLifecycleInfo, PartLifecycleStatus } from "@/types";

const STATUS_OPTIONS: Array<{ value: PartLifecycleStatus; label: string }> = [
  { value: "unknown", label: "Unknown" },
  { value: "active", label: "Active" },
  { value: "announced", label: "Announced" },
  { value: "obsolete", label: "Discontinued" },
];

const fieldClass =
  "spares-field mt-1 h-11 w-full rounded-2xl border-0 px-3 text-[15px] outline-none";

function draftFrom(lifecycle?: PartLifecycleInfo) {
  return {
    status: lifecycle?.status ?? "unknown",
    discontinuationDate: lifecycle?.discontinuationDate ?? "",
    successorPartNumber: lifecycle?.successorPartNumber ?? "",
  };
}

function lifecycleSummaryLine(lifecycle?: PartLifecycleInfo) {
  const status = lifecycle?.status ?? "unknown";
  const parts = [partLifecycleStatusLabel(status)];
  if (lifecycle?.discontinuationDate) {
    parts.push(`Ends ${lifecycle.discontinuationDate}`);
  }
  if (lifecycle?.successorPartNumber?.trim()) {
    parts.push(`→ ${lifecycle.successorPartNumber.trim()}`);
  }
  return parts.join(" · ");
}

export function StaffQuoteLineLifecycle({
  partNumber,
  lifecycle,
  onSaved,
}: {
  partNumber: string;
  lifecycle?: PartLifecycleInfo;
  onSaved: (next: PartLifecycleInfo) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => draftFrom(lifecycle));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setDraft(draftFrom(lifecycle));
    setEditing(false);
    setError(null);
    setNotice(null);
  }, [
    partNumber,
    lifecycle?.status,
    lifecycle?.discontinuationDate,
    lifecycle?.successorPartNumber,
  ]);

  const dirty = useMemo(() => {
    const base = draftFrom(lifecycle);
    return (
      draft.status !== base.status ||
      draft.discontinuationDate !== base.discontinuationDate ||
      draft.successorPartNumber !== base.successorPartNumber
    );
  }, [draft, lifecycle]);

  function cancelEdit() {
    setDraft(draftFrom(lifecycle));
    setError(null);
    setNotice(null);
    setEditing(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await saveStaffPartLifecycle({
        partNumber,
        patch: {
          status: draft.status,
          discontinuationDate: draft.discontinuationDate || undefined,
          successorPartNumber: draft.successorPartNumber || undefined,
        },
      });
      const row = result.parts.find((part) => part.partNumber === partNumber);
      if (row) {
        onSaved(row.lifecycle);
      }
      setNotice("Lifecycle saved to part catalog.");
      setEditing(false);
    } catch (cause) {
      setError(errorMessage(cause, "Could not save lifecycle."));
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div
        className="mt-3 space-y-1.5 rounded-2xl border border-white/8 bg-black/10 px-3 py-2.5"
        data-staff-quote-line-lifecycle=""
        data-staff-quote-line-lifecycle-mode="summary"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold tracking-tight">Part lifecycle (catalog)</p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="btn-soft inline-flex h-8 shrink-0 items-center rounded-full px-3 text-[12px] font-medium"
          >
            Edit
          </button>
        </div>
        <PartLifecycleNotice lifecycle={lifecycle} compact />
        <p className="spares-muted text-[11px] leading-snug">{lifecycleSummaryLine(lifecycle)}</p>
      </div>
    );
  }

  return (
    <div
      className="mt-3 space-y-2 rounded-2xl border border-white/8 bg-black/10 px-3 py-3"
      data-staff-quote-line-lifecycle=""
      data-staff-quote-line-lifecycle-mode="edit"
    >
      <p className="text-xs font-semibold tracking-tight">Part lifecycle (catalog)</p>
      <PartLifecycleNotice lifecycle={lifecycle} compact />
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="spares-muted block text-xs font-medium sm:col-span-2">
          Status
          <select
            value={draft.status}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                status: event.target.value as PartLifecycleStatus,
              }))
            }
            className={fieldClass}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="spares-muted block text-xs font-medium">
          Discontinuation date
          <input
            type="date"
            value={draft.discontinuationDate}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                discontinuationDate: event.target.value,
              }))
            }
            className={fieldClass}
          />
        </label>
        <label className="spares-muted block text-xs font-medium">
          Successor part number
          <input
            value={draft.successorPartNumber}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                successorPartNumber: event.target.value,
              }))
            }
            className={`${fieldClass} font-mono`}
          />
        </label>
      </div>
      {error ? (
        <p className="text-xs text-[#f0c4c0]" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="text-xs font-medium text-[var(--spares-ink)]" role="status">
          {notice}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving || !dirty}
          onClick={() => void save()}
          className="btn-primary inline-flex h-9 items-center rounded-full px-4 text-[13px] font-semibold disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save lifecycle"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={cancelEdit}
          className="btn-soft inline-flex h-9 items-center rounded-full px-4 text-[13px] font-medium disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
