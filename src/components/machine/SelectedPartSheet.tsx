"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { Part } from "@/lib/api/types";
import { staffPartLifecycleViewHref } from "@/lib/ui/part-lifecycle-url";
import { PartLifecycleNotice } from "@/components/part-lifecycle/PartLifecycleNotice";
import { PartDetailSheet } from "@/components/machine/PartDetailSheet";
import { ManualSubAssemblyChildListItems } from "@/components/machine/ManualSubAssemblyRows";
import { partSheetMetaLine, partSheetVisible } from "@/lib/ui/part-sheet";
import { useHydrated } from "@/lib/use-hydrated";

function manualSubParentBackLabel(parent: Part): string {
  const name = parent.name.trim();
  if (name) {
    return name;
  }
  const mesh = parent.meshName?.trim();
  return mesh ?? parent.id;
}

function manualSubCompactSummary(children: Part[]): string {
  if (children.length === 0) {
    return "";
  }
  const names = children
    .map((child) => child.name.trim())
    .filter(Boolean)
    .slice(0, 2);
  const suffix =
    children.length > names.length
      ? ` +${children.length - names.length} more`
      : "";
  if (names.length === 0) {
    return `${children.length} manual sub-part${children.length === 1 ? "" : "s"}`;
  }
  return `${children.length} sub-part${children.length === 1 ? "" : "s"} · ${names.join(", ")}${suffix}`;
}

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
  onEditSubParts,
  showEditSubParts = false,
  editSubPartsButtonRef,
  subPartsEditorOpen = false,
  modelViewMobile = false,
  phoneCompactSheet = false,
  onCompactPeekChange,
  onListPeekGuard,
  dismissOnEscape = true,
}: {
  part: Part | null;
  manualSubChildren?: Part[];
  manualSubParent?: Part | null;
  onSelectSubPart?: (part: Part) => void;
  staffViewPart?: boolean;
  showIsolateActions?: boolean;
  onEditSubParts?: () => void;
  showEditSubParts?: boolean;
  editSubPartsButtonRef?: RefObject<HTMLButtonElement | null>;
  /** Staff sub-parts editor open: keep Tab inside the editor trap. */
  subPartsEditorOpen?: boolean;
  /** Phone 3D: dock chip above tab bar so viewer controls stay clear. */
  modelViewMobile?: boolean;
  /** Phone list or 3D: compact peek until expanded. */
  phoneCompactSheet?: boolean;
  onCompactPeekChange?: (compact: boolean) => void;
  /** Brief list pass-through guard after compact→expanded (same tap must not hit list). */
  onListPeekGuard?: (blocked: boolean) => void;
  dismissOnEscape?: boolean;
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
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [blockSheetPointer, setBlockSheetPointer] = useState(false);
  const [addPending, setAddPending] = useState(false);
  const chipRef = useRef<HTMLDivElement>(null);
  const dragExpandRef = useRef<{ pointerId: number; startY: number } | null>(null);
  const touchDragRef = useRef<{ startY: number } | null>(null);
  const addPendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backToParentRef = useRef(false);
  const expandInertUntilRef = useRef(0);
  const listPeekGuardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMore(false);
    setAddPending(false);
    if (backToParentRef.current) {
      backToParentRef.current = false;
      setMobileExpanded(true);
      return;
    }
    setMobileExpanded(false);
  }, [part?.id]);

  useEffect(() => {
    return () => {
      onCompactPeekChange?.(false);
      onListPeekGuard?.(false);
      if (listPeekGuardTimer.current != null) {
        clearTimeout(listPeekGuardTimer.current);
      }
    };
  }, [onCompactPeekChange, onListPeekGuard]);

  useEffect(() => {
    return () => {
      if (addPendingTimer.current != null) {
        clearTimeout(addPendingTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const compact =
      Boolean(open && part) &&
      phoneCompactSheet &&
      !mobileExpanded &&
      !more &&
      !subPartsEditorOpen;
    onCompactPeekChange?.(compact);
  }, [
    open,
    part,
    phoneCompactSheet,
    mobileExpanded,
    more,
    subPartsEditorOpen,
    onCompactPeekChange,
  ]);

  useEffect(() => {
    chipRef.current?.scrollTo(0, 0);
  }, [part?.id, more]);

  useEffect(() => {
    if (!open) {
      setBlockSheetPointer(false);
      return;
    }
    setBlockSheetPointer(true);
    function release() {
      setBlockSheetPointer(false);
    }
    window.addEventListener("pointerup", release, { once: true });
    window.addEventListener("pointercancel", release, { once: true });
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(release);
    });
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      cancelAnimationFrame(frame);
    };
  }, [open, part?.id]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || !dismissOnEscape) {
        return;
      }
      event.preventDefault();
      onListPeekGuard?.(false);
      onCompactPeekChange?.(false);
      onDismiss();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onDismiss, dismissOnEscape, onCompactPeekChange, onListPeekGuard]);

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

  const isManualSubChild =
    Boolean(manualSubParent) && part.id !== manualSubParent?.id;
  const viewingParentAssembly =
    Boolean(
      manualSubParent &&
        manualSubChildren?.length &&
        part.id === manualSubParent.id,
    );
  const showAddInHeader = Boolean(showAdd && onAdd && isManualSubChild);
  const showAddOnSubPartRows = Boolean(showAdd && onAdd && viewingParentAssembly);
  const showAddInFooter = Boolean(
    showAdd && onAdd && !showAddInHeader && !showAddOnSubPartRows,
  );
  const mobileCompact =
    phoneCompactSheet && !mobileExpanded && !more && !subPartsEditorOpen;

  const compactSubSummary =
    viewingParentAssembly && manualSubChildren && manualSubChildren.length > 0
      ? manualSubCompactSummary(manualSubChildren)
      : "";

  function runAdd() {
    if (!onAdd || !part || !canAct || addPending) {
      return;
    }
    setAddPending(true);
    onAdd(part);
    if (addPendingTimer.current != null) {
      clearTimeout(addPendingTimer.current);
    }
    addPendingTimer.current = setTimeout(() => {
      setAddPending(false);
      addPendingTimer.current = null;
    }, 750);
  }

  function armListPeekGuard() {
    expandInertUntilRef.current = Date.now() + 480;
    onListPeekGuard?.(true);
    if (listPeekGuardTimer.current != null) {
      clearTimeout(listPeekGuardTimer.current);
    }
    listPeekGuardTimer.current = setTimeout(() => {
      onListPeekGuard?.(false);
      listPeekGuardTimer.current = null;
    }, 520);
  }

  function expandMobileSheet() {
    armListPeekGuard();
    setMobileExpanded(true);
  }

  function selectSubPart(row: Part) {
    if (Date.now() < expandInertUntilRef.current) {
      return;
    }
    onSelectSubPart?.(row);
  }

  function sheetSubPartInteractionTarget(target: EventTarget | null): boolean {
    return (
      target instanceof Element &&
      Boolean(
        target.closest(
          "button, a, input, textarea, select, [data-part-sheet-control], [data-part-sheet-close], [data-manual-sub-sheet], [data-manual-sub-part], .bom-data-row--hit",
        ),
      )
    );
  }

  function onCompactChipPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const sheetDraggable =
      mobileCompact || (phoneCompactSheet && mobileExpanded && !more);
    if (!sheetDraggable || event.button !== 0) {
      return;
    }
    const target = event.target;
    if (sheetSubPartInteractionTarget(target)) {
      return;
    }
    dragExpandRef.current = { pointerId: event.pointerId, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onCompactChipPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragExpandRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const dy = event.clientY - drag.startY;
    if (mobileCompact && dy < -28) {
      dragExpandRef.current = null;
      expandMobileSheet();
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }
    if (!mobileCompact && mobileExpanded && !more && dy > 28) {
      dragExpandRef.current = null;
      setMobileExpanded(false);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    }
  }

  function onCompactChipPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragExpandRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    dragExpandRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    if (Math.abs(event.clientY - drag.startY) < 8) {
      expandMobileSheet();
    }
  }

  function onCompactTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    const sheetDraggable =
      mobileCompact || (phoneCompactSheet && mobileExpanded && !more);
    if (!sheetDraggable) {
      return;
    }
    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }
    if (sheetSubPartInteractionTarget(event.target)) {
      return;
    }
    touchDragRef.current = { startY: touch.clientY };
  }

  function onCompactTouchMove(event: React.TouchEvent<HTMLDivElement>) {
    const drag = touchDragRef.current;
    const touch = event.changedTouches[0];
    if (!drag || !touch) {
      return;
    }
    const dy = touch.clientY - drag.startY;
    if (mobileCompact && dy < -28) {
      touchDragRef.current = null;
      expandMobileSheet();
      return;
    }
    if (!mobileCompact && mobileExpanded && !more && dy > 28) {
      touchDragRef.current = null;
      setMobileExpanded(false);
    }
  }

  function onCompactTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    const drag = touchDragRef.current;
    const touch = event.changedTouches[0];
    if (!drag || !touch) {
      return;
    }
    touchDragRef.current = null;
    if (mobileCompact && Math.abs(touch.clientY - drag.startY) < 8) {
      expandMobileSheet();
    }
  }

  function selectParentExpanded() {
    if (!manualSubParent || !onSelectSubPart) {
      return;
    }
    armListPeekGuard();
    backToParentRef.current = true;
    setMobileExpanded(true);
    setMore(false);
    onSelectSubPart(manualSubParent);
  }

  function swallowBackTouchEnd(event: React.TouchEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  function swallowBackPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
  }

  return (
    <div
      data-part-sheet=""
      inert={subPartsEditorOpen ? true : undefined}
      data-sheet-anchor={listView ? "list" : modelViewMobile ? "model-mobile" : "model"}
      className={
        listView
          ? `pointer-events-none absolute inset-x-3 z-[70] max-w-none ${
              quoteTrayPeek
                ? "bottom-[calc(var(--peek-h,8.65rem)+5.25rem+env(safe-area-inset-bottom,0px))]"
                : "bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))]"
            }`
          : modelViewMobile
            ? `pointer-events-none absolute inset-x-3 z-[70] max-w-none ${
                quoteTrayPeek
                  ? "bottom-[calc(var(--peek-h,14.5rem)+env(safe-area-inset-bottom,0px))]"
                  : "bottom-[env(safe-area-inset-bottom,0px)]"
              }`
            : "pointer-events-none absolute top-[7.5rem] left-3 z-[70] max-w-[min(20rem,calc(100%-1.5rem))]"
      }
    >
      <div
        ref={chipRef}
        className={`viewer-chrome-chip overflow-x-hidden rounded-2xl px-3 py-2.5 part-sheet-chip ${
          blockSheetPointer ? "pointer-events-none" : "pointer-events-auto"
        } ${held ? "scale-[1.02]" : "scale-100"} chrome-fade`}
        data-part-sheet-chip=""
        data-part-sheet-more-open={more ? "" : undefined}
        data-part-sheet-compact={mobileCompact ? "" : undefined}
        onPointerDown={(event) => {
          onCompactChipPointerDown(event);
          event.stopPropagation();
        }}
        onPointerMove={onCompactChipPointerMove}
        onPointerUp={onCompactChipPointerUp}
        onPointerCancel={onCompactChipPointerUp}
        onTouchStart={onCompactTouchStart}
        onTouchMove={onCompactTouchMove}
        onTouchEnd={onCompactTouchEnd}
        onTouchCancel={onCompactTouchEnd}
        onClickCapture={(event) => {
          if (Date.now() < expandInertUntilRef.current) {
            event.preventDefault();
            event.stopPropagation();
          }
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
                {...activate(selectParentExpanded)}
                onTouchEnd={swallowBackTouchEnd}
                onPointerUp={swallowBackPointerUp}
                className="part-sheet-back-parent mb-1.5 inline-flex min-h-11 w-full max-w-full items-center gap-1 rounded-full bg-white/14 px-3 py-2 text-[12px] font-semibold text-[var(--spares-on-chip)]"
                data-part-sheet-back-motor=""
              >
                <span className="part-sheet-back-title min-w-0 truncate text-left leading-snug">
                  <span aria-hidden="true">← </span>
                  Back to {manualSubParentBackLabel(manualSubParent)}
                </span>
              </button>
            ) : null}
            <p
              className="text-[13px] leading-snug font-semibold tracking-tight break-words"
              data-part-sheet-title=""
            >
              {part.name}
            </p>
            <p
              className="chrome-quiet font-mono text-[11px] break-all"
              data-part-sheet-detail=""
            >
              <span>{part.id}</span>
              {typeof part.qty === "number" && part.qty > 0 ? (
                <span className="part-sheet-qty-inline font-sans tabular-nums">
                  {" "}
                  · ×{part.qty}
                </span>
              ) : null}
            </p>
            {compactSubSummary ? (
              <p
                className="part-sheet-compact-summary chrome-quiet mt-0.5 truncate text-[11px] leading-snug"
                data-part-sheet-compact-summary=""
                onPointerDown={(event) => {
                  if (!mobileCompact || event.button !== 0) {
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  expandMobileSheet();
                }}
                onClick={(event) => {
                  if (!mobileCompact) {
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                {compactSubSummary}
              </p>
            ) : null}
          </div>
          {showAddInHeader ? (
            <button
              type="button"
              {...activate(runAdd)}
              disabled={!canAct || addPending}
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
        <div data-part-sheet-detail="">
          <PartLifecycleNotice lifecycle={part.lifecycle} compact />
          {(() => {
            const bits: string[] = [];
            if (part.vendor?.trim()) {
              bits.push(part.vendor.trim());
            }
            if (part.stock?.trim()) {
              bits.push(`stock ${part.stock.trim()}`);
            }
            return bits.length > 0 ? (
              <p className="chrome-quiet mb-1 text-[11px] leading-snug break-words">
                {bits.join(" · ")}
              </p>
            ) : null;
          })()}
        </div>
        {mobileCompact ? (
          <>
            <div className="mb-1 flex flex-wrap items-center gap-2" data-part-sheet-compact-actions="">
              {typeof part.qty === "number" && part.qty > 0 ? (
                <span className="chrome-quiet text-[12px] font-medium tabular-nums">
                  Qty {part.qty}
                </span>
              ) : null}
              {showAddInFooter && !showAddInHeader ? (
                <button
                  type="button"
                  {...activate(runAdd)}
                  disabled={!canAct || addPending}
                  className="btn-accent inline-flex h-9 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold disabled:opacity-30"
                >
                  Add
                </button>
              ) : null}
              {showAddOnSubPartRows ? (
                <span className="chrome-quiet text-[11px]">Tap a sub-part to add</span>
              ) : null}
            </div>
            <div
              className="part-sheet-expand-hint chrome-quiet mb-1 items-center justify-center gap-1 py-0.5 text-[10px] font-medium uppercase tracking-wide"
              aria-hidden="true"
            >
              <span>Swipe up for details</span>
            </div>
          </>
        ) : null}
        {!mobileCompact &&
        manualSubChildren &&
        manualSubChildren.length > 0 &&
        manualSubParent ? (
          <div
            className="mb-2 border-t border-white/8 pt-2"
            data-manual-sub-sheet=""
            data-part-sheet-detail=""
          >
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
                onSelect={selectSubPart}
                selectInertUntil={expandInertUntilRef}
                onAdd={onAdd}
                showAdd={showAddOnSubPartRows}
                compact
                treeLayout="sheet"
              />
            </ul>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2" data-part-sheet-actions-full="">
          {showAddInFooter ? (
            <button
              type="button"
              {...activate(runAdd)}
              disabled={!canAct || addPending}
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
          {showEditSubParts && onEditSubParts ? (
            <button
              ref={editSubPartsButtonRef}
              type="button"
              data-part-sheet-edit-sub-parts=""
              {...activate(onEditSubParts)}
              disabled={!canAct}
              className="inline-flex h-11 min-h-11 items-center rounded-full bg-white/8 px-3 text-[12px] font-semibold disabled:opacity-30"
            >
              Edit sub-parts
            </button>
          ) : null}
          <button
            type="button"
            data-part-sheet-control=""
            {...activate(() => {
              setMobileExpanded(true);
              setMore((current) => !current);
            })}
            disabled={!canAct}
            className="chrome-quiet inline-flex h-11 min-h-11 shrink-0 items-center rounded-full px-3 text-[12px] font-medium hover:text-[var(--spares-on-chip)] disabled:opacity-30"
            aria-expanded={more}
          >
            More
          </button>
        </div>
        {more ? (
          <div
            className="mt-2 space-y-2 border-t border-white/8 pt-2"
            data-part-sheet-more-panel=""
          >
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
