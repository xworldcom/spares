"use client";

import { useEffect, useMemo, useState } from "react";
import type { MachineDetail, Part } from "@/lib/api/types";
import type { ManualSubPart } from "@/types";
import {
  assemblyKeyForPart,
  groupForPart,
} from "@/lib/manual-sub-assembly";
import { mutateMachineManualSubPart } from "@/lib/api/machines";
import { errorMessage } from "@/lib/api/errors";

function emptyDraft(): ManualSubPart {
  return { id: "", name: "", qty: 1 };
}

export function StaffManualSubAssemblyEditor({
  machine,
  parentPart,
  onMachineUpdated,
}: {
  machine: MachineDetail;
  parentPart: Part;
  onMachineUpdated: (machine: MachineDetail) => void;
}) {
  const assemblyKey = assemblyKeyForPart(parentPart);
  const group = useMemo(
    () => groupForPart(machine.manualSubAssemblies, parentPart),
    [machine.manualSubAssemblies, parentPart],
  );
  const children = group?.children ?? [];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ManualSubPart>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEditingId(null);
    setDraft(emptyDraft());
    setError(null);
  }, [parentPart.id, assemblyKey]);

  async function runMutation(
    body:
      | { op: "add"; child: ManualSubPart }
      | { op: "update"; child: ManualSubPart }
      | { op: "remove"; childId: string }
      | { op: "reorder"; childIds: string[] },
  ) {
    setSaving(true);
    setError(null);
    try {
      const updated = await mutateMachineManualSubPart(machine.id, {
        baseVersion: machine.version ?? 1,
        assemblyKey,
        ...body,
      } as import("@/lib/manual-sub-assembly").ManualSubPartMutation);
      onMachineUpdated(updated);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function saveChild() {
    const id = draft.id.trim();
    const name = draft.name.trim();
    if (!id || !name) {
      setError("Enter a part number and name");
      return;
    }
    const child: ManualSubPart = {
      id,
      name,
      qty: Math.max(1, Math.floor(draft.qty) || 1),
      ...(draft.vendor?.trim() ? { vendor: draft.vendor.trim() } : {}),
    };
    await runMutation(
      editingId
        ? { op: "update", child }
        : { op: "add", child },
    );
    setEditingId(null);
    setDraft(emptyDraft());
  }

  async function removeChild(childId: string) {
    await runMutation({ op: "remove", childId });
    if (editingId === childId) {
      setEditingId(null);
      setDraft(emptyDraft());
    }
  }

  async function moveChild(childId: string, direction: -1 | 1) {
    const ids = children.map((row) => row.id);
    const index = ids.indexOf(childId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) {
      return;
    }
    const next = ids.slice();
    const [row] = next.splice(index, 1);
    next.splice(target, 0, row);
    await runMutation({ op: "reorder", childIds: next });
  }

  return (
    <section
      data-staff-manual-sub=""
      className="mt-4 border-t border-white/8 pt-3"
      aria-labelledby="manual-sub-heading"
    >
      <h2 id="manual-sub-heading" className="text-[13px] font-medium">
        Manual sub-assembly parts
      </h2>
      <p className="spares-muted mt-1 text-[12px] leading-snug">
        Vendor kit breakdown for{" "}
        <span className="font-mono">{parentPart.meshName || parentPart.id}</span>.
        Shown to buyers under this assembly.
      </p>

      {children.length > 0 ? (
        <ul className="spares-surface mt-2 overflow-hidden rounded-[18px]">
          {children.map((child, index) => (
            <li
              key={child.id}
              className="border-t border-white/6 first:border-t-0"
            >
              <div className="flex items-start gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{child.name}</p>
                  <p className="truncate font-mono text-xs spares-muted">
                    {child.id}
                    {child.vendor ? ` · ${child.vendor}` : ""}
                    {" · "}qty {child.qty}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    disabled={saving || index === 0}
                    onClick={() => void moveChild(child.id, -1)}
                    className="btn-soft h-8 rounded-full px-2 text-xs disabled:opacity-40"
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={saving || index === children.length - 1}
                    onClick={() => void moveChild(child.id, 1)}
                    className="btn-soft h-8 rounded-full px-2 text-xs disabled:opacity-40"
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setEditingId(child.id);
                    setDraft({ ...child });
                  }}
                  className="btn-soft h-9 rounded-full px-3 text-xs font-semibold"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void removeChild(child.id)}
                  className="btn-soft h-9 rounded-full px-3 text-xs font-semibold"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="spares-muted mt-2 text-[13px]">No manual sub-parts yet.</p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="spares-muted col-span-2 block text-xs font-medium">
          Part number
          <input
            value={draft.id}
            onChange={(event) =>
              setDraft((current) => ({ ...current, id: event.target.value }))
            }
            disabled={Boolean(editingId)}
            className="spares-field mt-1 h-10 w-full rounded-2xl border-0 px-3 font-mono text-[14px] outline-none disabled:opacity-60"
          />
        </label>
        <label className="spares-muted col-span-2 block text-xs font-medium">
          Name
          <input
            value={draft.name}
            onChange={(event) =>
              setDraft((current) => ({ ...current, name: event.target.value }))
            }
            className="spares-field mt-1 h-10 w-full rounded-2xl border-0 px-3 text-[15px] outline-none"
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
            className="spares-field mt-1 h-10 w-full rounded-2xl border-0 px-3 text-[15px] tabular-nums outline-none"
          />
        </label>
        <label className="spares-muted block text-xs font-medium">
          Vendor
          <input
            value={draft.vendor ?? ""}
            onChange={(event) =>
              setDraft((current) => ({ ...current, vendor: event.target.value }))
            }
            className="spares-field mt-1 h-10 w-full rounded-2xl border-0 px-3 text-[15px] outline-none"
          />
        </label>
      </div>
      {error ? (
        <p className="mt-2 text-sm text-[#f0c4c0]" role="alert">{error}</p>
      ) : null}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void saveChild()}
          className="btn-primary inline-flex h-10 flex-1 items-center justify-center rounded-full text-[14px] font-semibold disabled:opacity-40"
        >
          {saving ? "Saving…" : editingId ? "Update sub-part" : "Add sub-part"}
        </button>
        {editingId ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setEditingId(null);
              setDraft(emptyDraft());
            }}
            className="btn-soft inline-flex h-10 items-center rounded-full px-4 text-[14px] font-semibold"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </section>
  );
}
