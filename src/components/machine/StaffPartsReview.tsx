"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { MachineDetail, Part } from "@/lib/api/types";
import {
  extraModelMeshes,
  staffCatalogRows,
  staffJoinCounts,
  type StaffCatalogRow,
} from "@/lib/staff-catalog";
import {
  ManualSubAssemblyChildListItems,
  ManualSubAssemblyCountBadge,
  ManualSubAssemblyExpandButton,
  manualGroupForParent,
  useManualSubAssemblyTree,
} from "@/components/machine/ManualSubAssemblyRows";
import { StaffManualSubAssemblyEditor } from "@/components/machine/StaffManualSubAssemblyEditor";

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

function StaffCatalogTreeEntry({
  row,
  machine,
  selected,
  selectedPartId,
  onSelectRow,
  onSelectPart,
  onOpenPartEdit,
  onToggleSubPartsEdit,
  subPartsEditOpen,
  onMachineUpdated,
}: {
  row: StaffCatalogRow;
  machine: MachineDetail;
  selected: boolean;
  selectedPartId: string | null;
  onSelectRow: (row: StaffCatalogRow) => void;
  onSelectPart: (part: Part | null) => void;
  onOpenPartEdit: () => void;
  onToggleSubPartsEdit: () => void;
  subPartsEditOpen: boolean;
  onMachineUpdated?: (machine: MachineDetail) => void;
}) {
  const parentPart =
    row.status === "joined"
      ? machine.parts.find((item) => item.id === row.partNumber) ?? null
      : null;
  const manualGroup = parentPart
    ? manualGroupForParent(machine.manualSubAssemblies, parentPart)
    : undefined;
  const tree = useManualSubAssemblyTree(manualGroup);

  return (
    <Fragment>
      <li className={selected ? "row-on-ink" : undefined}>
        <div className="flex min-h-14 w-full items-center gap-1 py-2 pr-4">
          <span className="w-1 shrink-0" aria-hidden="true" />
          <div className="flex min-w-0 flex-1 items-center gap-0.5">
            {tree.hasChildren && parentPart ? (
              <ManualSubAssemblyExpandButton
                open={tree.open}
                count={tree.count}
                onToggle={tree.toggle}
              />
            ) : (
              <span className="w-9 shrink-0" aria-hidden="true" />
            )}
            {tree.hasChildren ? (
              <ManualSubAssemblyCountBadge count={tree.count} selected={selected} />
            ) : null}
            <button
              type="button"
              onPointerDown={() => onSelectRow(row)}
              onClick={() => onSelectRow(row)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{row.name}</span>
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
                {row.status === "missing-mesh" ? (
                  <span
                    className={`block text-[12px] ${
                      selected ? "row-on-ink-muted" : "spares-muted"
                    }`}
                  >
                    {statusLabel(row.status)}
                  </span>
                ) : null}
                <span
                  className={`block tabular-nums text-sm ${
                    selected ? "row-on-ink-muted" : "spares-muted"
                  }`}
                >
                  {row.qty}
                </span>
              </span>
            </button>
          </div>
          {selected && row.status === "joined" ? (
            <div className="flex shrink-0 flex-col gap-1">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenPartEdit();
                }}
                className="btn-soft inline-flex h-8 items-center rounded-full px-2.5 text-[11px] font-semibold"
              >
                Edit part
              </button>
              {tree.hasChildren ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleSubPartsEdit();
                  }}
                  className="btn-soft inline-flex h-8 items-center rounded-full px-2.5 text-[11px] font-semibold"
                  aria-expanded={subPartsEditOpen}
                >
                  Edit sub-parts
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </li>
      {tree.open && parentPart && manualGroup ? (
        <ManualSubAssemblyChildListItems
          parent={parentPart}
          group={manualGroup}
          selectedPartId={selectedPartId}
          onSelect={onSelectPart}
          variant="staff"
        />
      ) : null}
      {subPartsEditOpen && selected && parentPart && manualGroup && onMachineUpdated ? (
        <li className="border-t border-white/6 px-4 py-3" data-staff-manual-sub-inline="">
          <StaffManualSubAssemblyEditor
            machine={machine}
            parentPart={parentPart}
            onMachineUpdated={onMachineUpdated}
            onClose={onToggleSubPartsEdit}
          />
        </li>
      ) : null}
    </Fragment>
  );
}

export function StaffPartsReview({
  machine,
  selectedPartId,
  suggestedMeshName,
  onSuggestedMeshUsed,
  onSelectPart,
  onSave,
  onMachineUpdated,
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
  onMachineUpdated?: (machine: MachineDetail) => void;
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
  const [partEditOpen, setPartEditOpen] = useState(false);
  const [subPartsEditOpen, setSubPartsEditOpen] = useState(false);
  const [subPartsEditRowKey, setSubPartsEditRowKey] = useState<string | null>(null);

  useEffect(() => {
    setPartEditOpen(false);
    setSubPartsEditOpen(false);
    setSubPartsEditRowKey(null);
  }, [selectedPartId, missingKey]);

  const selectedKey = missingKey ?? (selectedPartId ? `part:${selectedPartId}` : null);
  const selectedRow = rows.find((row) => row.key === selectedKey) ?? null;

  useEffect(() => {
    if (selectedPartId && missingKey) {
      setMissingKey(null);
    }
  }, [selectedPartId, missingKey]);

  useEffect(() => {
    if (selectedRow && selectedRow.key !== draftKey) {
      setDraftKey(selectedRow.key);
      setDraft(draftFromRow(selectedRow));
      setLocalError(null);
    }
    if (!selectedRow && draftKey) {
      setDraftKey(null);
    }
  }, [selectedRow, draftKey]);

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
    setPartEditOpen(false);
    setSubPartsEditOpen(false);
    setSubPartsEditRowKey(null);
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

  function toggleSubPartsEditor(rowKey: string) {
    if (subPartsEditOpen && subPartsEditRowKey === rowKey) {
      setSubPartsEditOpen(false);
      setSubPartsEditRowKey(null);
      return;
    }
    setPartEditOpen(false);
    setSubPartsEditOpen(true);
    setSubPartsEditRowKey(rowKey);
  }

  return (
    <div data-staff-parts="" className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-3 machine-bom-list-pad">
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
          <p className="spares-muted mt-4 text-sm">
            No parts are listed on this machine yet.
          </p>
        ) : filtered.length === 0 ? (
          <p className="spares-muted mt-4 text-sm">No parts match that search.</p>
        ) : (
          <ul className="spares-surface mt-3 overflow-hidden rounded-[22px]">
            {filtered.map((row) => (
              <StaffCatalogTreeEntry
                key={row.key}
                row={row}
                machine={machine}
                selected={row.key === selectedKey}
                selectedPartId={selectedPartId}
                onSelectRow={selectRow}
                onSelectPart={onSelectPart}
                onOpenPartEdit={() => {
                  setSubPartsEditOpen(false);
                  setSubPartsEditRowKey(null);
                  setPartEditOpen(true);
                }}
                onToggleSubPartsEdit={() => toggleSubPartsEditor(row.key)}
                subPartsEditOpen={subPartsEditOpen && subPartsEditRowKey === row.key}
                onMachineUpdated={onMachineUpdated}
              />
            ))}
          </ul>
        )}

        {extras.length > 0 ? (
          <section className="mt-5" aria-labelledby="extra-meshes-heading">
            <h2
              id="extra-meshes-heading"
              className="text-[13px] font-medium"
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
                          active ? "row-on-ink" : ""
                        }`}
                      >
                        {name}
                      </button>
                    ) : (
                      <p className="flex min-h-12 items-center px-4 py-2 font-mono text-[13px]">
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

      {selectedRow && partEditOpen ? (
        <form
          data-staff-edit=""
          className="spares-surface shrink-0 border-t border-white/8 px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[13px] font-medium">Edit part</p>
            <button
              type="button"
              onClick={() => setPartEditOpen(false)}
              className="btn-soft inline-flex h-8 items-center rounded-full px-3 text-[12px] font-semibold"
            >
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="spares-muted col-span-2 block text-xs font-medium">
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
            <label className="spares-muted col-span-2 block text-xs font-medium">
              Name
              <input
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
                className="spares-field mt-1 h-11 w-full rounded-2xl border-0 px-3 text-[16px] outline-none"
              />
            </label>
            <label className="spares-muted block text-xs font-medium">
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
            <label className="spares-muted block text-xs font-medium">
              Mesh name
              <input
                value={meshName}
                onChange={(event) => setMeshName(event.target.value)}
                className="spares-field mt-1 h-11 w-full rounded-2xl border-0 px-3 font-mono text-[15px] outline-none"
              />
            </label>
          </div>
          {localError || saveError ? (
            <p className="mt-2 text-sm text-[#f0c4c0]" role="alert">
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
