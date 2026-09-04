"use client";

import { useEffect } from "react";
import type { Part } from "@/lib/api/types";
import { partSheetVisible } from "@/lib/ui/part-sheet";
import { useHydrated } from "@/lib/use-hydrated";

export function SelectedPartSheet({
  part,
  isolated,
  onHide,
  onIsolate,
  onAdd,
  onDismiss,
  showAdd,
  dimmed,
  held,
}: {
  part: Part | null;
  isolated?: boolean;
  onHide: () => void;
  onIsolate: () => void;
  onAdd?: () => void;
  onDismiss: () => void;
  showAdd?: boolean;
  dimmed?: boolean;
  held?: boolean;
}) {
  const ready = useHydrated();
  const open = partSheetVisible(part?.id);
  const canAct = open && ready;

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
      className={`pointer-events-none absolute inset-x-0 bottom-0 z-30 px-3 pb-3 chrome-fade ${
        dimmed ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100"
      }`}
    >
      <div
        className="pointer-events-auto flex flex-col justify-between rounded-[22px] bg-white px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.18)] ring-1 ring-black/8"
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-h-[3.25rem] min-w-0">
            <p className="truncate text-[17px] leading-tight font-semibold tracking-tight text-[#0b0d10]">
              {part.name}
            </p>
            <p className="spares-muted mt-1 truncate font-mono text-[13px]">
              {!ready
                ? "Preparing controls…"
                : isolated
                  ? "Only this part is solid. Others are dimmed."
                  : part.id}
            </p>
          </div>
          <button
            type="button"
            {...activate(onDismiss)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#0b0d10] hover:bg-neutral-100"
            aria-label="Close part actions"
          >
            <span className="text-2xl leading-none">×</span>
          </button>
        </div>
        <div
          className={`mt-2 flex flex-wrap gap-2 ${held ? "scale-[1.02]" : "scale-100"} chrome-fade`}
        >
          <button
            type="button"
            {...activate(onHide)}
            disabled={!canAct}
            className="btn-soft inline-flex h-11 min-w-11 items-center justify-center rounded-full px-4 text-sm font-medium disabled:opacity-30"
          >
            Hide
          </button>
          <button
            type="button"
            {...activate(onIsolate)}
            disabled={!canAct}
            className="btn-soft inline-flex h-11 min-w-11 items-center justify-center rounded-full px-4 text-sm font-medium disabled:opacity-30"
          >
            {isolated ? "Seeing only this" : "See only this"}
          </button>
          {showAdd && onAdd ? (
            <button
              type="button"
              {...activate(onAdd)}
              disabled={!canAct}
              className="btn-accent inline-flex h-11 flex-1 items-center justify-center rounded-full px-4 text-sm font-semibold disabled:opacity-30"
            >
              Add
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
