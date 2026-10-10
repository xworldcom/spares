"use client";

import { useEffect, useState } from "react";
import type { Part } from "@/lib/api/types";
import { PartLifecycleNotice } from "@/components/part-lifecycle/PartLifecycleNotice";
import { PartDetailSheet } from "@/components/machine/PartDetailSheet";
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
  held,
  listView,
}: {
  part: Part | null;
  isolated?: boolean;
  isolatedViewPart?: Part | null;
  onHide: () => void;
  onIsolate: () => void;
  onShowAll: () => void;
  onAdd?: () => void;
  onDismiss: () => void;
  showAdd?: boolean;
  held?: boolean;
  /** List view: dock the chip above the tab bar so search/title stay visible. */
  listView?: boolean;
}) {
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

  if (!open || !part) {
    return null;
  }

  return (
    <div
      data-part-sheet=""
      className={
        listView
          ? "pointer-events-none absolute inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] z-20 max-w-none"
          : "pointer-events-none absolute top-[4.35rem] left-3 z-30 max-w-[min(20rem,calc(100%-5.5rem))]"
      }
    >
      <div
        className={`viewer-chrome-chip pointer-events-auto rounded-2xl px-3 py-2.5 ${
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
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-[13px] leading-tight font-semibold tracking-tight">
              {part.name}
            </p>
            <p className="chrome-quiet truncate font-mono text-[11px]">
              {part.id}
            </p>
            <PartLifecycleNotice lifecycle={part.lifecycle} compact />
            {partSheetMetaLine(part) ? (
              <p className="chrome-quiet truncate text-[11px]">{partSheetMetaLine(part)}</p>
            ) : null}
          </div>
          {showAdd && onAdd ? (
            <button
              type="button"
              {...activate(onAdd)}
              disabled={!canAct}
              className="btn-accent inline-flex h-9 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold disabled:opacity-30"
            >
              Add
            </button>
          ) : null}
          <button
            type="button"
            data-part-sheet-control=""
            {...activate(() => setMore((current) => !current))}
            disabled={!canAct}
            className="chrome-quiet inline-flex h-9 shrink-0 items-center rounded-full px-2.5 text-[12px] font-medium hover:text-[var(--spares-on-chip)] disabled:opacity-30"
            aria-expanded={more}
          >
            More
          </button>
        </div>
        {more ? (
          <div className="mt-2 space-y-2 border-t border-white/8 pt-2">
            <PartDetailSheet part={part} />
            <div className="flex flex-wrap gap-1.5">
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
