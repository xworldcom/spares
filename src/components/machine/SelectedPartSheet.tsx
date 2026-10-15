"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { Part } from "@/lib/api/types";
import { staffPartLifecycleViewHref } from "@/lib/ui/part-lifecycle-url";
import { PartLifecycleNotice } from "@/components/part-lifecycle/PartLifecycleNotice";
import { PartDetailSheet } from "@/components/machine/PartDetailSheet";
import { ManualSubAssemblyChildListItems } from "@/components/machine/ManualSubAssemblyRows";
import { partSheetMetaLine, partSheetVisible } from "@/lib/ui/part-sheet";
import { useHydrated } from "@/lib/use-hydrated";

export function SelectedPartSheet({
  part,
  isolated,
  isolatedViewPart,
  onHide,
  onIsolate,
  onShowAll,
  onAdd,
  onDismiss,
  showAdd,
  manualSubChildren,
  manualSubParent,
  onSelectSubPart,
  held,
  listView,
  quoteTrayPeek,
  staffViewPart = true,
  showIsolateActions = true,
}: {
  part: Part | null;
  manualSubChildren?: Part[];
  manualSubParent?: Part | null;
  onSelectSubPart?: (part: Part) => void;
  staffViewPart?: boolean;
  showIsolateActions?: boolean;
  isolated?: boolean;
  isolatedViewPart?: Part | null;
  onHide: () => void;
  onIsolate: () => void;
  onShowAll: () => void;
  onAdd?: (part: Part) => void;
  onDismiss: () => void;
  showAdd?: boolean;
  held?: boolean;
  /** List view: dock the chip above the tab bar so search/title stay visible. */
  listView?: boolean;
  /** List + quote peek: lift the chip above the tray so the next row stays tappable. */
  quoteTrayPeek?: boolean;
}) {
  const { user } = useAuth();
  const staff = user?.role === "staff";
  const showStaffViewPart = staff && staffViewPart;
  const ready = useHydrated();
  const open = partSheetVisible(part?.id);
  const canAct = open && ready;
  const [more, setMore] = useState(false);

  useEffect(() => {
    setMore(false);
  }, [part?.id]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onDismiss]);

  function activate(action: () => void) {
    return {
      onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
        if (!canAct || event.button !== 0) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        action();
      },
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
        if (event.detail !== 0) {
          event.preventDefault();
          return;
        }
        if (!canAct) {
          return;
        }
        action();
      },
    };
  }

  if (!ready || !open || !part) {
    return null;
  }

  const isParentAssembly =
    Boolean(manualSubParent) &&
    Boolean(manualSubChildren?.length) &&
    part.id === manualSubParent?.id;
  const isManualSubChild =
    Boolean(manualSubParent) && part.id !== manualSubParent?.id;

  return (
    <div
      data-part-sheet=""
      className={
        listView
          ? `pointer-events-none absolute inset-x-3 z-[70] max-w-none ${
              quoteTrayPeek
                ? "bottom-[calc(var(--peek-h,8.65rem)+5.25rem+env(safe-area-inset-bottom,0px))]"
                : "bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))]"
            }`
          : "pointer-events-none absolute top-[7.5rem] left-3 z-[70] max-w-[min(20rem,calc(100%-1.5rem))]"
      }
    >
      <div
        className={`viewer-chrome-chip pointer-events-auto max-h-[min(52vh,20rem)] overflow-y-auto rounded-2xl px-3 py-2.5 ${
          held ? "scale-[1.02]" : "scale-100"
        } chrome-fade`}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
      >
        {isolatedViewPart ? (
          <div
            className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-white/8 pb-2"
            data-isolation-banner=""
          >
            <p className="chrome-quiet min-w-0 flex-1 text-[11px] leading-snug">
              Showing only{" "}
              <span className="font-medium text-[var(--spares-on-chip)]">
                {isolatedViewPart.name}
              </span>
            </p>
            <button
              type="button"
              {...activate(onShowAll)}
              className="inline-flex h-8 shrink-0 items-center rounded-full bg-white/10 px-2.5 text-[11px] font-semibold"
            >
              Show all
            </button>
          </div>
        ) : null}
        <div className="part-sheet-header mb-1 flex items-start justify-between gap-2" data-part-sheet-header="">
          <div className="min-w-0 flex-1 pt-0.5">
            {isManualSubChild && manualSubParent && onSelectSubPart ? (
              <button
                type="button"
                {...activate(() => onSelectSubPart(manualSubParent))}
                className="mb-1 inline-flex h-9 max-w-full items-center gap-1 rounded-full bg-white/10 px-2.5 text-[11px] font-semibold text-[var(--spares-on-chip)]"
                data-part-sheet-back-motor=""
              >
                <span aria-hidden="true">←</span>
                <span className="truncate">{manualSubParent.name}</span>
              </button>
            ) : null}
            <p className="text-[13px] leading-tight font-semibold tracking-tight break-words">
              {part.name}
            </p>
            <p className="chrome-quiet font-mono text-[11px] break-all">
              {part.id}
            </p>
          </div>
          {showAdd && onAdd && isParentAssembly ? (
            <button
              type="button"
              {...activate(() => onAdd(part))}
              disabled={!canAct}
              className="btn-accent inline-flex h-11 min-h-11 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold disabled:opacity-30"
            >
              Add
            </button>
          ) : null}
          <button
            type="button"
            data-part-sheet-close=""
            data-part-sheet-control=""
            aria-label="Close part details"
            {...activate(onDismiss)}
            disabled={!canAct}
            className="part-sheet-close inline-flex h-11 w-11 min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl leading-none hover:bg-white/14 disabled:opacity-30"
          >
            ×
          </button>
        </div>
        <PartLifecycleNotice lifecycle={part.lifecycle} compact />
        {partSheetMetaLine(part) ? (
          <p className="chrome-quiet mb-1 text-[11px] leading-snug break-words">
            {partSheetMetaLine(part)}
          </p>
        ) : null}
        {manualSubChildren && manualSubChildren.length > 0 && manualSubParent ? (
          <div className="mb-2 border-t border-white/8 pt-2" data-manual-sub-sheet="">
            <ul className="overflow-hidden">
              <ManualSubAssemblyChildListItems
                parent={manualSubParent}
                group={{
                  assemblyKey: manualSubParent.meshName || manualSubParent.id,
                  children: manualSubChildren.map((child) => ({
                    id: child.id,
                    name: child.name,
                    qty: child.qty,
                  })),
                }}
                selectedPartId={part.id}
                onSelect={(row) => onSelectSubPart?.(row)}
                onAdd={onAdd}
                showAdd={showAdd && Boolean(onAdd)}
                compact
                treeLayout="sheet"
              />
            </ul>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {showAdd && onAdd && !isParentAssembly ? (
            <button
              type="button"
              {...activate(() => onAdd(part))}
              disabled={!canAct}
              className="btn-accent inline-flex h-11 min-h-11 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold disabled:opacity-30"
            >
              Add
            </button>
          ) : null}
          {showStaffViewPart ? (
            <Link
              href={staffPartLifecycleViewHref(part.id)}
              className="btn-primary inline-flex h-9 shrink-0 items-center rounded-full px-3 text-[12px] font-semibold"
            >
              View part
            </Link>
          ) : null}
          <button
            type="button"
            data-part-sheet-control=""
            {...activate(() => setMore((current) => !current))}
            disabled={!canAct}
            className="chrome-quiet inline-flex h-11 min-h-11 shrink-0 items-center rounded-full px-3 text-[12px] font-medium hover:text-[var(--spares-on-chip)] disabled:opacity-30"
            aria-expanded={more}
          >
            More
          </button>
        </div>
        {more ? (
          <div className="mt-2 space-y-2 border-t border-white/8 pt-2">
            <PartDetailSheet part={part} />
            <div className="flex flex-wrap gap-1.5">
            {showIsolateActions ? (
              <>
                <button
                  type="button"
                  {...activate(onHide)}
                  disabled={!canAct}
                  className="inline-flex h-9 items-center rounded-full bg-white/8 px-3 text-[12px] font-medium disabled:opacity-30"
                >
                  Hide
                </button>
                <button
                  type="button"
                  {...activate(onIsolate)}
                  disabled={!canAct}
                  className={`${
                    isolated
                      ? "bg-[var(--spares-on-chip)] text-[var(--spares-chip)]"
                      : "bg-white/8 text-[var(--spares-on-chip)]"
                  } inline-flex h-9 items-center rounded-full px-3 text-[12px] font-medium disabled:opacity-30`}
                >
                  {isolated ? "Show all parts" : "Only this"}
                </button>
              </>
            ) : null}
            <button
              type="button"
              {...activate(onDismiss)}
              className="chrome-quiet inline-flex h-9 items-center rounded-full px-3 text-[12px] font-medium hover:text-[var(--spares-on-chip)]"
            >
              Close
            </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
