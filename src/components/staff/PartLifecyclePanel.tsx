"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { partLifecycleStatusLabel } from "@/lib/part-lifecycle-copy";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PartLifecycleStatusCounts } from "@/lib/part-lifecycle";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import type { PartLifecycleStatus } from "@/types";
import {
  bulkSaveStaffPartLifecycle,
  fetchStaffPartLifecycle,
  saveStaffPartLifecycle,
  staffPartLifecycleDefaultListPath,
  staffPartLifecycleDefaultWarmKey,
  type StaffPartCatalogRow,
  type StaffPartLifecycleResponse,
} from "@/lib/api/part-lifecycle";
import { useSeedListSlotOnce } from "@/lib/ui/use-seed-list-slot";
import { errorMessage } from "@/lib/api/errors";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { UNSAVED_LIFECYCLE_LEAVE_PROMPT } from "@/lib/ui/pending-send-guard";
import { useLeavePageGuard } from "@/lib/ui/use-leave-page-guard";
import {
  partLifecycleFiltersFromSearch,
  staffPartLifecycleHref,
} from "@/lib/ui/part-lifecycle-url";
import { PartLifecycleMachinesUsed } from "@/components/staff/PartLifecycleMachinesUsed";
import { useLifecycleAlerts } from "@/components/notifications/LifecycleAlerts";

const STATUS_OPTIONS: Array<{ value: PartLifecycleStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "unknown", label: "Unknown" },
  { value: "active", label: "Active" },
  { value: "announced", label: "Announced" },
  { value: "obsolete", label: "Discontinued" },
];

const EMPTY_STATUS_COUNTS: PartLifecycleStatusCounts = {
  all: 0,
  active: 0,
  announced: 0,
  obsolete: 0,
  unknown: 0,
};

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

function isDefaultPartLifecycleFilters(input: {
  status: PartLifecycleStatus | "all";
  machineId: string;
  q: string;
}) {
  return input.status === "all" && !input.machineId && !input.q;
}

export function PartLifecyclePanel({
  initialList,
  listEtag,
}: {
  initialList?: StaffPartLifecycleResponse | null;
  listEtag?: string | null;
} = {}) {
  const { unreadPartNumbers, refresh: refreshLifecycleAlerts } = useLifecycleAlerts();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialFilters = partLifecycleFiltersFromSearch(searchParams);
  const urlDefaultFilters = isDefaultPartLifecycleFilters({
    status: initialFilters.status,
    machineId: initialFilters.machineId,
    q: initialFilters.q,
  });
  useSeedListSlotOnce(
    staffPartLifecycleDefaultWarmKey(),
    staffPartLifecycleDefaultListPath(),
    urlDefaultFilters ? initialList : null,
    urlDefaultFilters ? listEtag : null,
    urlDefaultFilters,
  );
  const [status, setStatus] = useState<PartLifecycleStatus | "all">(
    initialFilters.status,
  );
  const [machineId, setMachineId] = useState(initialFilters.machineId);
  const [query, setQuery] = useState(initialFilters.q);
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const urlFiltersRef = useRef(initialFilters);
  const hasDefaultInitial = urlDefaultFilters && Boolean(initialList);
  const [parts, setParts] = useState<StaffPartCatalogRow[]>(
    hasDefaultInitial ? (initialList?.parts ?? []) : [],
  );
  const [statusCounts, setStatusCounts] = useState<PartLifecycleStatusCounts>(
    hasDefaultInitial ? (initialList?.statusCounts ?? EMPTY_STATUS_COUNTS) : EMPTY_STATUS_COUNTS,
  );
  const [machines, setMachines] = useState<
    Array<{ id: string; name: string; siteId?: string }>
  >(hasDefaultInitial ? (initialList?.machines ?? []) : []);
  const [loading, setLoading] = useState(!hasDefaultInitial);
  const loadGenerationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<StaffPartCatalogRow | null>(null);
  const [draft, setDraft] = useState(draftFromRow({ partNumber: "", name: "", machineIds: [], machineNames: [], lifecycle: { status: "unknown" } }));
  const [saving, setSaving] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [selectedNumbers, setSelectedNumbers] = useState<Set<string>>(new Set());
  const [highlightPart, setHighlightPart] = useState(
    () => searchParams.get("highlight")?.trim() ?? "",
  );

  const initialLoadSkipped = useRef(hasDefaultInitial);

  const load = useCallback(
    async (options?: { background?: boolean }): Promise<StaffPartCatalogRow[] | null> => {
      const background = options?.background ?? false;
      const generation = loadGenerationRef.current + 1;
      loadGenerationRef.current = generation;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const filtersDefault = isDefaultPartLifecycleFilters({
        status,
        machineId,
        q: debouncedQuery,
      });
      if (filtersDefault && initialList && initialLoadSkipped.current) {
        initialLoadSkipped.current = false;
        return initialList.parts;
      }
      if (!background) {
        setLoading(true);
        setError(null);
      }
      try {
        const data = await fetchStaffPartLifecycle(
          {
            status,
            machineId: machineId || undefined,
            q: debouncedQuery || undefined,
          },
          { signal: controller.signal },
        );
        if (loadGenerationRef.current !== generation) {
          return null;
        }
        setParts(data.parts);
        setStatusCounts(data.statusCounts ?? EMPTY_STATUS_COUNTS);
        setMachines(data.machines);
        return data.parts;
      } catch (cause) {
        if (controller.signal.aborted) {
          return null;
        }
        if (loadGenerationRef.current !== generation) {
          return null;
        }
        if (!background) {
          setError(errorMessage(cause, "Could not load parts."));
        }
        return null;
      } finally {
        if (!background && loadGenerationRef.current === generation) {
          setLoading(false);
        }
      }
    },
    [debouncedQuery, initialList, machineId, status],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!hasDefaultInitial || !listEtag) {
      return;
    }
    const controller = new AbortController();
    void fetchStaffPartLifecycle(
      { status: "all" },
      { signal: controller.signal },
    ).catch(() => undefined);
    return () => controller.abort();
  }, [hasDefaultInitial, listEtag]);

  useEffect(() => {
    const next = {
      status,
      machineId,
      q: debouncedQuery,
    };
    const prev = urlFiltersRef.current;
    if (
      prev.status === next.status &&
      prev.machineId === next.machineId &&
      prev.q === next.q
    ) {
      return;
    }
    urlFiltersRef.current = next;
    router.replace(staffPartLifecycleHref(next), { scroll: false });
  }, [status, machineId, debouncedQuery, router]);

  useEffect(() => {
    if (selected) {
      setDraft(draftFromRow(selected));
    }
  }, [selected]);

  useEffect(() => {
    const next = searchParams.get("highlight")?.trim() ?? "";
    if (next) {
      setHighlightPart(next);
      const row = parts.find((part) => part.partNumber === next);
      if (row) {
        setSelected(row);
      }
    }
  }, [searchParams, parts]);

  const dirty = Boolean(
    selected &&
      (draft.status !== selected.lifecycle.status ||
        draft.discontinuationDate !== (selected.lifecycle.discontinuationDate ?? "") ||
        draft.lastTimeBuyDate !== (selected.lifecycle.lastTimeBuyDate ?? "") ||
        draft.successorPartNumber !== (selected.lifecycle.successorPartNumber ?? "") ||
        draft.sourceNotes !== (selected.lifecycle.sourceNotes ?? "")),
  );

  useLeavePageGuard(dirty && !saving && !bulkBusy, UNSAVED_LIFECYCLE_LEAVE_PROMPT);

  function discardDraft() {
    if (!selected) {
      return;
    }
    setDraft(draftFromRow(selected));
    setError(null);
  }

  function confirmDiscard(): boolean {
    if (!dirty) {
      return true;
    }
    return window.confirm(UNSAVED_LIFECYCLE_LEAVE_PROMPT);
  }

  async function save() {
    if (!selected) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveStaffPartLifecycle({
        partNumber: selected.partNumber,
        patch: {
          status: draft.status,
          discontinuationDate: draft.discontinuationDate || undefined,
          lastTimeBuyDate: draft.lastTimeBuyDate || undefined,
          successorPartNumber: draft.successorPartNumber || undefined,
          sourceNotes: draft.sourceNotes || undefined,
        },
      });
      const savedLifecycle = {
        status: draft.status,
        discontinuationDate: draft.discontinuationDate || undefined,
        lastTimeBuyDate: draft.lastTimeBuyDate || undefined,
        successorPartNumber: draft.successorPartNumber || undefined,
        sourceNotes: draft.sourceNotes || undefined,
      };
      setParts((rows) =>
        rows.map((row) =>
          row.partNumber === selected.partNumber
            ? { ...row, lifecycle: savedLifecycle }
            : row,
        ),
      );
      setSelected((current) =>
        current && current.partNumber === selected.partNumber
          ? { ...current, lifecycle: savedLifecycle }
          : current,
      );
      setDraft(draftFromRow({ ...selected, lifecycle: savedLifecycle }));
      setSaveNotice("Saved lifecycle.");
      window.setTimeout(() => setSaveNotice(null), 4000);
      void load({ background: true });
      void refreshLifecycleAlerts();
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
      await bulkSaveStaffPartLifecycle({
        updates: [...selectedNumbers].map((partNumber) => ({
          partNumber,
          patch: { status: next },
        })),
      });
      const label = partLifecycleStatusLabel(next);
      const touched = new Set(selectedNumbers);
      setParts((rows) =>
        rows.map((row) =>
          touched.has(row.partNumber)
            ? { ...row, lifecycle: { ...row.lifecycle, status: next } }
            : row,
        ),
      );
      setBulkNotice(`Marked ${touched.size} ${touched.size === 1 ? "part" : "parts"} ${label.toLowerCase()}.`);
      window.setTimeout(() => setBulkNotice(null), 4000);
      void load({ background: true });
      void refreshLifecycleAlerts();
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
          {parts.length} {parts.length === 1 ? "part" : "parts"} shown
          {status === "all"
            ? ` · ${statusCounts.announced + statusCounts.obsolete} at risk`
            : ""}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <label className="block">
          <span className="spares-muted text-xs font-medium">Search</span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              if (!confirmDiscard()) {
                return;
              }
              setQuery(event.target.value);
            }}
            placeholder="Part number or name"
            className="spares-field mt-1 h-11 w-full rounded-2xl border-0 px-4 text-[16px] outline-none"
          />
        </label>
        <label className="block min-w-[12rem]">
          <span className="spares-muted text-xs font-medium">Machine</span>
          <select
            value={machineId}
            onChange={(event) => {
              if (!confirmDiscard()) {
                return;
              }
              setMachineId(event.target.value);
            }}
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
            onClick={() => {
              if (option.value === status) {
                return;
              }
              if (!confirmDiscard()) {
                return;
              }
              setStatus(option.value);
            }}
            aria-pressed={status === option.value}
            className={`inline-flex h-9 items-center rounded-full px-3 text-[13px] font-medium ${
              status === option.value ? "btn-primary" : "btn-soft"
            }`}
          >
            {option.label}
            <span className="spares-muted ml-1.5 tabular-nums">
              {loading
                ? "—"
                : statusCounts[option.value === "all" ? "all" : option.value]}
            </span>
          </button>
        ))}
      </div>

      {parts.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <button
            type="button"
            className="btn-soft inline-flex h-8 items-center rounded-full px-3 font-medium"
            onClick={() => {
              if (selectedNumbers.size === parts.length) {
                setSelectedNumbers(new Set());
                return;
              }
              setSelectedNumbers(new Set(parts.map((row) => row.partNumber)));
            }}
          >
            {selectedNumbers.size === parts.length ? "Clear all" : "Select all on page"}
          </button>
        </div>
      ) : null}

      {selectedNumbers.size > 0 ? (
        <div className="staff-lifecycle-bulk-bar spares-surface flex flex-wrap items-center gap-2 rounded-2xl px-4 py-3 text-[13px]">
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
            Mark discontinued
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

      {bulkNotice ? (
        <p className="text-sm text-[#e8c27a]" role="status">
          {bulkNotice}
        </p>
      ) : null}

      {error ? (
        parts.length === 0 ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : (
          <p className="text-sm text-[#f0c4c0]" role="alert">
            {error}
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => void load()}
            >
              Retry
            </button>
          </p>
        )
      ) : null}

      {loading ? (
        <LoadingState label="Loading parts…" />
      ) : parts.length === 0 ? (
        <EmptyState
          title="No parts found"
          message="Try a different search, machine filter, or status."
        />
      ) : (
        <ul className="spares-surface overflow-hidden rounded-[22px]">
          {parts.map((row) => {
            const active = selected?.partNumber === row.partNumber;
            const checked = selectedNumbers.has(row.partNumber);
            const unreadObsolete = unreadPartNumbers.has(row.partNumber);
            const highlighted = highlightPart === row.partNumber;
            return (
              <li
                key={row.partNumber}
                className={`border-t border-white/6 first:border-t-0 ${
                  unreadObsolete ? "bg-[#e8c27a]/8" : ""
                } ${highlighted ? "ring-1 ring-inset ring-[#0a84ff]/60" : ""}`}
              >
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
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          selected?.partNumber === row.partNumber ||
                          confirmDiscard()
                        ) {
                          setSelected(row);
                        }
                      }}
                      className="w-full text-left"
                    >
                      <span className="block truncate text-[15px] font-medium">{row.name}</span>
                      <span
                        className={`block truncate font-mono text-xs ${
                          active ? "row-on-ink-muted" : "spares-muted"
                        }`}
                      >
                        {row.partNumber}
                      </span>
                    </button>
                    <PartLifecycleMachinesUsed
                      machineIds={row.machineIds}
                      machineNames={row.machineNames}
                      status={status}
                      query={debouncedQuery}
                      className={active ? "row-on-ink-muted" : undefined}
                      mutedClassName={active ? "row-on-ink-muted" : "spares-muted"}
                      onFilterMachine={(nextMachineId) => {
                        if (!confirmDiscard()) {
                          return;
                        }
                        setMachineId(nextMachineId);
                      }}
                    />
                  </div>
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
          id="part-lifecycle-detail-form"
          name="partLifecycleDetail"
          className="spares-surface space-y-3 rounded-[22px] px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <p className="text-[15px] font-semibold tracking-tight">
            {selected.partNumber}
          </p>
          <PartLifecycleMachinesUsed
            machineIds={selected.machineIds}
            machineNames={selected.machineNames}
            status={status}
            query={debouncedQuery}
            onFilterMachine={(nextMachineId) => {
              if (!confirmDiscard()) {
                return;
              }
              setMachineId(nextMachineId);
            }}
          />
          <label htmlFor="part-lifecycle-status" className="spares-muted block text-xs font-medium">
            Status
            <select
              id="part-lifecycle-status"
              name="lifecycleStatus"
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
          {saveNotice ? (
            <p className="text-sm text-[#e8c27a]" role="status">
              {saveNotice}
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={saving || !dirty}
              onClick={discardDraft}
              className="btn-soft inline-flex h-11 flex-1 items-center justify-center rounded-full text-[15px] font-semibold disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !dirty}
              className="btn-primary inline-flex h-11 flex-1 items-center justify-center rounded-full text-[15px] font-semibold disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save lifecycle"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
