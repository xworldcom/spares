"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { bindFocusTrap, focusableElements } from "@/lib/ui/focus-trap";
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
  onClose,
  lockBodyScroll = true,
  returnFocusRef,
}: {
  machine: MachineDetail;
  parentPart: Part;
  onMachineUpdated: (machine: MachineDetail) => void;
  onClose: () => void;
  /** List/3D viewer overlays should not trap document scroll. */
  lockBodyScroll?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
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
  const rootRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setEditingId(null);
    setDraft(emptyDraft());
    setError(null);
  }, [parentPart.id, assemblyKey]);

  useEffect(() => {
    const timers = [0, 50, 120].map((delay) =>
      window.setTimeout(() => {
        cancelRef.current?.focus({ preventScroll: true });
      }, delay),
    );
    return () => {
      for (const id of timers) {
        window.clearTimeout(id);
      }
    };
  }, [parentPart.id, assemblyKey]);

  useEffect(() => {
    const section = rootRef.current;
    if (!section) {
      return;
    }
    const root =
      section.closest<HTMLElement>("[data-staff-manual-sub-overlay]") ?? section;
    const frame = requestAnimationFrame(() => {
      (cancelRef.current ?? focusableElements(root)[0])?.focus({ preventScroll: true });
    });
    const releaseTrap = bindFocusTrap(root, { initialFocus: cancelRef.current });
    return () => {
      cancelAnimationFrame(frame);
      releaseTrap();
    };
  }, [children.length, editingId]);

  useEffect(() => {
    if (!lockBodyScroll) {
      return;
    }
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, [lockBodyScroll]);

  const closeEditor = useCallback(() => {
    onClose();
    const target = returnFocusRef?.current;
    if (target) {
      requestAnimationFrame(() => {
        target.focus({ preventScroll: true });
      });
    }
  }, [onClose, returnFocusRef]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        const scrollY = window.scrollY || document.documentElement.scrollTop;
        const scrollRoots = Array.from(
          document.querySelectorAll<HTMLElement>(".machine-bom-scroll, [data-staff-parts]"),
        ).map((element) => ({ element, top: element.scrollTop }));
        closeEditor();
        const restoreScroll = () => {
          window.scrollTo(0, scrollY);
          document.documentElement.scrollTop = scrollY;
          document.body.scrollTop = scrollY;
          for (const { element, top } of scrollRoots) {
            element.scrollTop = top;
          }
        };
        restoreScroll();
        requestAnimationFrame(restoreScroll);
        setTimeout(restoreScroll, 0);
        setTimeout(restoreScroll, 50);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [closeEditor]);

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
      ref={rootRef}
      data-staff-manual-sub=""
      className="mt-1"
      aria-labelledby="manual-sub-heading"
    >
      <div className="staff-manual-sub-toolbar mb-2 flex flex-wrap items-start gap-2">
        <button
          ref={cancelRef}
          type="button"
          data-staff-manual-sub-cancel=""
          tabIndex={0}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            closeEditor();
          }}
          className="btn-soft order-first inline-flex h-11 min-h-11 shrink-0 items-center rounded-full px-4 text-[13px] font-semibold"
        >
          Cancel
        </button>
        <div className="min-w-0 flex-1 basis-full sm:basis-auto">
          <h2 id="manual-sub-heading" className="text-[13px] font-medium">
            Manual sub-assembly parts
          </h2>
          <p className="spares-muted mt-1 text-[12px] leading-snug">
            Vendor kit breakdown for{" "}
            <span className="font-mono">{parentPart.meshName || parentPart.id}</span>.
          </p>
        </div>
      </div>

      {children.length > 0 ? (
        <ul className="spares-surface mt-2 overflow-hidden rounded-[18px]">
          {children.map((child, index) => (
            <li
              key={child.id}
              className="border-t border-white/6 first:border-t-0"
            >
              <div className="staff-manual-sub-row flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center">
                <div className="staff-manual-sub-reorder flex w-full shrink-0 flex-row items-center justify-center gap-1 sm:w-11 sm:flex-col sm:justify-center">
                  {index > 0 ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void moveChild(child.id, -1)}
                      className="btn-soft inline-flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-full text-sm font-semibold"
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                  ) : (
                    <span className="hidden h-11 w-11 sm:inline-block" aria-hidden="true" />
                  )}
                  {index < children.length - 1 ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void moveChild(child.id, 1)}
                      className="btn-soft inline-flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-full text-sm font-semibold"
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                  ) : (
                    <span className="hidden h-11 w-11 sm:inline-block" aria-hidden="true" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium leading-snug">{child.name}</p>
                  <p className="font-mono text-xs leading-snug spares-muted break-all">
                    {child.id}
                    {child.vendor ? ` · ${child.vendor}` : ""}
                    <span className="font-sans tabular-nums">
                      {" · "}×{child.qty}
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      setEditingId(child.id);
                      setDraft({ ...child });
                    }}
                    className="btn-soft inline-flex h-11 min-h-11 items-center justify-center rounded-full px-3 text-xs font-semibold"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void removeChild(child.id)}
                    className="btn-soft inline-flex h-11 min-h-11 items-center justify-center rounded-full px-3 text-xs font-semibold"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="spares-muted mt-2 text-[13px]">No manual sub-parts yet.</p>
      )}

      <div className="staff-manual-sub-form mt-3 flex flex-col gap-2 sm:grid sm:grid-cols-2">
        <label
          className="spares-muted block text-xs font-medium sm:col-span-2"
          htmlFor="manual-sub-part-number"
        >
          Part number
          <input
            id="manual-sub-part-number"
            value={draft.id}
            onChange={(event) =>
              setDraft((current) => ({ ...current, id: event.target.value }))
            }
            disabled={Boolean(editingId)}
            className="spares-field mt-1 h-11 w-full rounded-2xl border-0 px-3 font-mono text-[14px] outline-none disabled:opacity-60"
          />
        </label>
        <label
          className="spares-muted block text-xs font-medium sm:col-span-2"
          htmlFor="manual-sub-name"
        >
          Name
          <input
            id="manual-sub-name"
            value={draft.name}
            onChange={(event) =>
              setDraft((current) => ({ ...current, name: event.target.value }))
            }
            className="spares-field mt-1 h-11 w-full rounded-2xl border-0 px-3 text-[15px] outline-none"
          />
        </label>
        <label
          className="spares-muted block text-xs font-medium"
          htmlFor="manual-sub-qty"
        >
          Qty
          <input
            id="manual-sub-qty"
            type="number"
            min={1}
            aria-label="Quantity"
            value={draft.qty}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                qty: Number(event.target.value) || 1,
              }))
            }
            className="spares-field mt-1 h-11 w-full rounded-2xl border-0 px-3 text-[15px] tabular-nums outline-none"
          />
        </label>
        <label
          className="spares-muted block text-xs font-medium"
          htmlFor="manual-sub-vendor"
        >
          Vendor
          <input
            id="manual-sub-vendor"
            value={draft.vendor ?? ""}
            onChange={(event) =>
              setDraft((current) => ({ ...current, vendor: event.target.value }))
            }
            className="spares-field mt-1 h-11 w-full min-w-0 rounded-2xl border-0 px-3 text-[15px] outline-none"
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
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            setEditingId(null);
            setDraft(emptyDraft());
            setError(null);
          }}
          className="btn-soft inline-flex h-10 items-center rounded-full px-4 text-[14px] font-semibold"
        >
          Clear
        </button>
      </div>
    </section>
  );
}
