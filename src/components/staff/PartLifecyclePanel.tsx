"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import type { PartLifecycleStatus } from "@/types";
import {
  bulkSaveStaffPartLifecycle,
  fetchStaffPartLifecycle,
  saveStaffPartLifecycle,
  type StaffPartCatalogRow,
} from "@/lib/api/part-lifecycle";
import { errorMessage } from "@/lib/api/errors";
import { LoadingState } from "@/components/states/LoadingState";

const STATUS_OPTIONS: Array<{ value: PartLifecycleStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "unknown", label: "Unknown" },
  { value: "active", label: "Active" },
  { value: "announced", label: "Announced" },
  { value: "obsolete", label: "Obsolete" },
];

function statusLabel(status: PartLifecycleStatus) {
  return STATUS_OPTIONS.find((row) => row.value === status)?.label ?? status;
}

function draftFromRow(row: StaffPartCatalogRow) {
  return {
    status: row.lifecycle.status,
    discontinuationDate: row.lifecycle.discontinuationDate ?? "",
    lastTimeBuyDate: row.lifecycle.lastTimeBuyDate ?? "",
    successorPartNumber: row.lifecycle.successorPartNumber ?? "",
    sourceNotes: row.lifecycle.sourceNotes ?? "",
  };
}

export function PartLifecyclePanel() {
  const [status, setStatus] = useState<PartLifecycleStatus | "all">("all");
  const [machineId, setMachineId] = useState("");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const [parts, setParts] = useState<StaffPartCatalogRow[]>([]);
  const [machines, setMachines] = useState<
    Array<{ id: string; name: string; siteId?: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<StaffPartCatalogRow | null>(null);
  const [draft, setDraft] = useState(draftFromRow({ partNumber: "", name: "", machineIds: [], machineNames: [], lifecycle: { status: "unknown" } }));
  const [saving, setSaving] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selectedNumbers, setSelectedNumbers] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStaffPartLifecycle({
        status,
        machineId: machineId || undefined,
        q: debouncedQuery || undefined,
      });
      setParts(data.parts);
      setMachines(data.machines);
    } catch (cause) {
      setError(errorMessage(cause, "Could not load parts."));
      setParts([]);
    } finally {
      setLoading(false);
    }
  }, [status, machineId, debouncedQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selected) {
      setDraft(draftFromRow(selected));
    }
  }, [selected]);

  const counts = useMemo(() => {
    const tally: Record<PartLifecycleStatus, number> = {
      active: 0,
      announced: 0,
      obsolete: 0,
      unknown: 0,
    };
    for (const row of parts) {
      tally[row.lifecycle.status] += 1;
    }
    return tally;
  }, [parts]);

  const dirty =
    selected &&
    (draft.status !== selected.lifecycle.status ||
      draft.discontinuationDate !== (selected.lifecycle.discontinuationDate ?? "") ||
      draft.lastTimeBuyDate !== (selected.lifecycle.lastTimeBuyDate ?? "") ||
      draft.successorPartNumber !== (selected.lifecycle.successorPartNumber ?? "") ||
      draft.sourceNotes !== (selected.lifecycle.sourceNotes ?? ""));

  async function save() {
    if (!selected) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await saveStaffPartLifecycle({
        partNumber: selected.partNumber,
        patch: {
          status: draft.status,
          discontinuationDate: draft.discontinuationDate || undefined,
          lastTimeBuyDate: draft.lastTimeBuyDate || undefined,
          successorPartNumber: draft.successorPartNumber || undefined,
          sourceNotes: draft.sourceNotes || undefined,
        },
      });
      setParts(result.parts);
      const refreshed = result.parts.find((row) => row.partNumber === selected.partNumber);
      setSelected(refreshed ?? null);
    } catch (cause) {
      setError(errorMessage(cause, "Could not save."));
    } finally {
      setSaving(false);
    }
  }

  async function bulkSetStatus(next: PartLifecycleStatus) {
    if (selectedNumbers.size === 0) {
      return;
    }
    setBulkBusy(true);
    setError(null);
    try {
      const result = await bulkSaveStaffPartLifecycle({
        updates: [...selectedNumbers].map((partNumber) => ({
          partNumber,
          patch: { status: next },
        })),
      });
      setParts(result.parts);
      setSelectedNumbers(new Set());
    } catch (cause) {
      setError(errorMessage(cause, "Could not update those parts."));
    } finally {
      setBulkBusy(false);
    }
  }

  function toggleSelect(partNumber: string) {
    setSelectedNumbers((current) => {
      const next = new Set(current);
      if (next.has(partNumber)) {
        next.delete(partNumber);
      } else {
        next.add(partNumber);
      }
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-[13px]">
        <span className="spares-muted">
          {parts.length} parts shown
          {status === "all"
            ? ` · ${counts.announced + counts.obsolete} at risk`
            : ""}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <label className="block">
          <span className="spares-muted text-xs font-medium">Search</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Part number or name"
            className="spares-field mt-1 h-11 w-full rounded-2xl border-0 px-4 text-[16px] outline-none"
          />
        </label>
        <label className="block min-w-[12rem]">
          <span className="spares-muted text-xs font-medium">Machine</span>
          <select
            value={machineId}
            onChange={(event) => setMachineId(event.target.value)}
            className="spares-field mt-1 h-11 w-full rounded-2xl border-0 px-3 text-[15px] outline-none"
          >
            <option value="">All machines</option>
            {machines.map((machine) => (
              <option key={machine.id} value={machine.id}>
                {machine.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setStatus(option.value)}
            aria-pressed={status === option.value}
            className={`inline-flex h-9 items-center rounded-full px-3 text-[13px] font-medium ${
              status === option.value ? "btn-primary" : "btn-soft"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {selectedNumbers.size > 0 ? (
        <div className="spares-surface flex flex-wrap items-center gap-2 rounded-2xl px-4 py-3 text-[13px]">
          <span>{selectedNumbers.size} selected</span>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => void bulkSetStatus("active")}
            className="btn-soft inline-flex h-8 items-center rounded-full px-3 font-medium disabled:opacity-40"
          >
            Mark active
          </button>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => void bulkSetStatus("announced")}
            className="btn-soft inline-flex h-8 items-center rounded-full px-3 font-medium disabled:opacity-40"
          >
            Mark announced
          </button>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => void bulkSetStatus("obsolete")}
            className="btn-soft inline-flex h-8 items-center rounded-full px-3 font-medium disabled:opacity-40"
          >
            Mark obsolete
          </button>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => void bulkSetStatus("unknown")}
            className="btn-soft inline-flex h-8 items-center rounded-full px-3 font-medium disabled:opacity-40"
          >
            Mark unknown
          </button>
          <button
            type="button"
            onClick={() => setSelectedNumbers(new Set())}
            className="spares-muted underline-offset-2 hover:underline"
          >
            Clear
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-[#f0c4c0]" role="alert">{error}</p>
      ) : null}

      {loading ? (
        <LoadingState label="Loading parts…" />
      ) : parts.length === 0 ? (
        <p className="spares-muted text-sm">No parts match these filters.</p>
      ) : (
        <ul className="spares-surface overflow-hidden rounded-[22px]">
          {parts.map((row) => {
            const active = selected?.partNumber === row.partNumber;
            const checked = selectedNumbers.has(row.partNumber);
            return (
              <li key={row.partNumber} className="border-t border-white/6 first:border-t-0">
                <div
                  className={`flex min-h-14 items-start gap-3 px-4 py-3 ${
                    active ? "row-on-ink" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSelect(row.partNumber)}
                    className="mt-1"
                    aria-label={`Select ${row.partNumber}`}
                  />
                  <button
                    type="button"
                    onClick={() => setSelected(row)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-[15px] font-medium">{row.name}</span>
                    <span
                      className={`block truncate font-mono text-xs ${
                        active ? "row-on-ink-muted" : "spares-muted"
                      }`}
                    >
                      {row.partNumber}
                    </span>
                    <span
                      className={`mt-0.5 block truncate text-[12px] ${
                        active ? "row-on-ink-muted" : "spares-muted"
                      }`}
                    >
                      {row.machineNames.join(" · ")}
                    </span>
                  </button>
                  <span className="shrink-0 text-right text-[12px] font-medium">
                    {statusLabel(row.lifecycle.status)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {selected ? (
        <form
          className="spares-surface space-y-3 rounded-[22px] px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <p className="text-[15px] font-semibold tracking-tight">
            {selected.partNumber}
          </p>
          <label className="spares-muted block text-xs font-medium">
            Status
            <select
              value={draft.status}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  status: event.target.value as PartLifecycleStatus,
                }))
              }
              className="spares-field mt-1 h-11 w-full rounded-2xl border-0 px-3 text-[15px] outline-none"
            >
              {STATUS_OPTIONS.filter((row) => row.value !== "all").map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
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
                className="spares-field mt-1 h-11 w-full rounded-2xl border-0 px-3 text-[15px] outline-none"
              />
            </label>
            <label className="spares-muted block text-xs font-medium">
              Last time buy
              <input
                type="date"
                value={draft.lastTimeBuyDate}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    lastTimeBuyDate: event.target.value,
                  }))
                }
                className="spares-field mt-1 h-11 w-full rounded-2xl border-0 px-3 text-[15px] outline-none"
              />
            </label>
          </div>
          <label className="spares-muted block text-xs font-medium">
            Successor / alternate part number
            <input
              value={draft.successorPartNumber}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  successorPartNumber: event.target.value,
                }))
              }
              className="spares-field mt-1 h-11 w-full rounded-2xl border-0 px-3 font-mono text-[15px] outline-none"
            />
          </label>
          <label className="spares-muted block text-xs font-medium">
            Source / notes
            <textarea
              value={draft.sourceNotes}
              onChange={(event) =>
                setDraft((current) => ({ ...current, sourceNotes: event.target.value }))
              }
              rows={3}
              className="spares-field mt-1 w-full rounded-2xl border-0 px-3 py-2 text-[15px] outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={saving || !dirty}
            className="btn-primary inline-flex h-11 w-full items-center justify-center rounded-full text-[15px] font-semibold disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save lifecycle"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
