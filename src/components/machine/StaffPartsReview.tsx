"use client";

import { useMemo, useState } from "react";
import type { MachineDetail, Part } from "@/lib/api/types";
import {
  extraModelMeshes,
  staffCatalogRows,
  staffJoinCounts,
  type StaffCatalogRow,
} from "@/lib/staff-catalog";

function statusLabel(status: StaffCatalogRow["status"]) {
  return status === "joined" ? "Joined" : "Missing mesh";
}

function summaryText(counts: { joined: number; missing: number; extra: number }) {
  const bits = [
    `${counts.joined} joined`,
    counts.missing === 0
      ? "none missing"
      : counts.missing === 1
        ? "1 missing mesh"
        : `${counts.missing} missing mesh`,
    counts.extra === 0
      ? "none extra"
      : counts.extra === 1
        ? "1 extra in the model"
        : `${counts.extra} extra in the model`,
  ];
  return bits.join("  ·  ");
}

function draftFromRow(row: StaffCatalogRow) {
  return {
    partNumber: row.partNumber,
    name: row.name,
    meshName: row.meshName,
    qty: row.qty,
  };
}

export function StaffPartsReview({
  machine,
  selectedPartId,
  suggestedMeshName,
  onSuggestedMeshUsed,
  onSelectPart,
  onSave,
  saving,
  saveError,
}: {
  machine: MachineDetail;
  selectedPartId: string | null;
  suggestedMeshName?: string | null;
  onSuggestedMeshUsed?: () => void;
  onSelectPart: (part: Part | null) => void;
  onSave: (edit: {
    key: string;
    partNumber: string;
    name: string;
    meshName: string;
    qty: number;
  }) => Promise<string | void>;
  saving?: boolean;
  saveError?: string | null;
}) {
  const unmatched = machine.unmatched;
  const rows = useMemo(
    () => staffCatalogRows(machine.parts, unmatched),
    [machine.parts, unmatched],
  );
  const extras = useMemo(() => extraModelMeshes(unmatched), [unmatched]);
  const counts = useMemo(
    () => staffJoinCounts(machine.parts, unmatched),
    [machine.parts, unmatched],
  );
  const [query, setQuery] = useState("");
  const [missingKey, setMissingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    partNumber: "",
    name: "",
    meshName: "",
    qty: 1,
  });
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  if (selectedPartId && missingKey) {
    setMissingKey(null);
  }

  const selectedKey = missingKey ?? (selectedPartId ? `part:${selectedPartId}` : null);
  const selectedRow = rows.find((row) => row.key === selectedKey) ?? null;

  if (selectedRow && selectedRow.key !== draftKey) {
    setDraftKey(selectedRow.key);
    setDraft(draftFromRow(selectedRow));
    setLocalError(null);
  }
  if (!selectedRow && draftKey) {
    setDraftKey(null);
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return rows;
    }
    return rows.filter((row) => {
      const hay = `${row.name} ${row.partNumber} ${row.meshName}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, query]);

  const meshName = suggestedMeshName || draft.meshName;
  const dirty =
    selectedRow !== null &&
    (draft.partNumber !== selectedRow.partNumber ||
      draft.name !== selectedRow.name ||
      meshName !== selectedRow.meshName ||
      draft.qty !== selectedRow.qty);

  function selectRow(row: StaffCatalogRow) {
    const part = machine.parts.find((item) => item.id === row.partNumber) ?? null;
    if (row.status === "missing-mesh") {
      setMissingKey(row.key);
      onSelectPart(null);
    } else {
      setMissingKey(null);
      onSelectPart(part);
    }
    setDraftKey(row.key);
    setDraft(draftFromRow(row));
    setLocalError(null);
  }

  function setMeshName(next: string) {
    setDraft((current) => ({ ...current, meshName: next }));
    onSuggestedMeshUsed?.();
  }

  async function save() {
    if (!selectedRow) {
      return;
    }
    const partNumber = draft.partNumber.trim();
    const name = draft.name.trim();
    if (!partNumber) {
      setLocalError("Enter a part number");
      return;
    }
    if (!name) {
      setLocalError("Enter a name");
      return;
    }
    if (!Number.isFinite(draft.qty) || draft.qty < 1) {
      setLocalError("Qty must be 1 or more");
      return;
    }
    setLocalError(null);
    const nextKey = await onSave({
      key: selectedRow.key,
      partNumber,
      name,
      meshName: meshName.trim(),
      qty: Math.floor(draft.qty),
    });
    if (nextKey) {
      if (nextKey.startsWith("list:")) {
        setMissingKey(nextKey);
      } else {
        setMissingKey(null);
      }
      setDraftKey(nextKey);
    }
  }

  return (
    <div data-staff-parts="" className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-3">
        <p className="truncate text-[15px] font-semibold tracking-tight">
          {machine.name}
        </p>
        <p className="spares-muted mt-1 text-[13px]">{summaryText(counts)}</p>

        <label className="mt-3 block">
          <span className="sr-only">Search parts</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search parts"
            className="spares-field h-12 w-full rounded-2xl border-0 px-4 text-[16px] outline-none"
          />
        </label>

        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500">
            No parts are listed on this machine yet.
          </p>
        ) : filtered.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500">No parts match that search.</p>
        ) : (
          <ul data-parts-bom="" className="spares-surface mt-3 overflow-hidden rounded-[22px]">
            {filtered.map((row) => {
              const selected = row.key === selectedKey;
              return (
                <li key={row.key}>
                  <button
                    type="button"
                    onPointerDown={() => selectRow(row)}
                    onClick={() => selectRow(row)}
                    className={`flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left ${
                      selected ? "row-on-ink" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">
                        {row.name}
                      </span>
                      <span
                        className={`block truncate font-mono text-xs ${
                          selected ? "row-on-ink-muted" : "spares-muted"
                        }`}
                      >
                        {row.partNumber}
                        {row.meshName ? `  ·  ${row.meshName}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span
                        className={`block text-[12px] ${
                          selected ? "row-on-ink-muted" : "spares-muted"
                        }`}
                      >
                        {statusLabel(row.status)}
                      </span>
                      <span
                        className={`block tabular-nums text-sm ${
                          selected ? "row-on-ink-muted" : "spares-muted"
                        }`}
                      >
                        {row.qty}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {extras.length > 0 ? (
          <section className="mt-5" aria-labelledby="extra-meshes-heading">
            <h2
              id="extra-meshes-heading"
              className="text-[13px] font-medium text-neutral-800"
            >
              In the model, not on the list
            </h2>
            <p className="spares-muted mt-1 text-[13px]">
              {selectedRow
                ? "Tap a mesh to link it to this part, then save."
                : "Read-only until you select a part."}
            </p>
            <ul className="spares-surface mt-2 overflow-hidden rounded-[22px]">
              {extras.map((name) => {
                const active = meshName === name && Boolean(selectedRow);
                return (
                  <li key={name}>
                    {selectedRow ? (
                      <button
                        type="button"
                        onClick={() => setMeshName(name)}
                        className={`flex min-h-12 w-full items-center px-4 py-2 text-left font-mono text-[13px] ${
                          active ? "row-on-ink" : "text-neutral-700"
                        }`}
                      >
                        {name}
                      </button>
                    ) : (
                      <p className="flex min-h-12 items-center px-4 py-2 font-mono text-[13px] text-neutral-700">
                        {name}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>

      {selectedRow ? (
        <form
          data-staff-edit=""
          className="spares-surface shrink-0 border-t border-black/6 px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <p className="mb-2 text-[13px] font-medium text-neutral-800">Edit part</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-2 block text-xs font-medium text-neutral-500">
              Part number
              <input
                value={draft.partNumber}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    partNumber: event.target.value,
                  }))
                }
                className="spares-field mt-1 h-11 w-full rounded-2xl border-0 px-3 font-mono text-[15px] outline-none"
              />
            </label>
            <label className="col-span-2 block text-xs font-medium text-neutral-500">
              Name
              <input
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
                className="spares-field mt-1 h-11 w-full rounded-2xl border-0 px-3 text-[16px] outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-neutral-500">
              Qty
              <input
                type="number"
                min={1}
                value={draft.qty}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    qty: Number(event.target.value) || 1,
                  }))
                }
                className="spares-field mt-1 h-11 w-full rounded-2xl border-0 px-3 text-[16px] tabular-nums outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-neutral-500">
              Mesh name
              <input
                value={meshName}
                onChange={(event) => setMeshName(event.target.value)}
                className="spares-field mt-1 h-11 w-full rounded-2xl border-0 px-3 font-mono text-[15px] outline-none"
              />
            </label>
          </div>
          {localError || saveError ? (
            <p className="mt-2 text-sm text-red-700" role="alert">
              {localError ?? saveError}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={saving || !dirty}
            className="btn-primary mt-3 inline-flex h-11 w-full items-center justify-center rounded-full text-[15px] font-semibold disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
