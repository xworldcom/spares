"use client";

import { useEffect, useState } from "react";
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
  held,
}: {
  part: Part | null;
  isolated?: boolean;
  onHide: () => void;
  onIsolate: () => void;
  onAdd?: () => void;
  onDismiss: () => void;
  showAdd?: boolean;
  held?: boolean;
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
      className="pointer-events-none absolute top-14 left-3 z-30 max-w-[min(20rem,calc(100%-5.5rem))]"
    >
      <div
        className={`pointer-events-auto rounded-2xl bg-white/92 px-2.5 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.18)] ring-1 ring-black/8 backdrop-blur-md ${
          held ? "scale-[1.02]" : "scale-100"
        } chrome-fade`}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] leading-tight font-semibold tracking-tight text-[#0b0d10]">
              {part.name}
            </p>
            <p className="spares-muted truncate font-mono text-[11px]">
              {part.id}
            </p>
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
            onClick={() => setMore((current) => !current)}
            className="inline-flex h-9 shrink-0 items-center rounded-full px-2.5 text-[12px] font-medium text-neutral-700 hover:bg-neutral-100"
            aria-expanded={more}
          >
            More
          </button>
        </div>
        {more ? (
          <div className="mt-2 flex flex-wrap gap-1.5 border-t border-black/6 pt-2">
            <button
              type="button"
              {...activate(onHide)}
              disabled={!canAct}
              className="btn-soft inline-flex h-9 items-center rounded-full px-3 text-[12px] font-medium disabled:opacity-30"
            >
              Hide
            </button>
            <button
              type="button"
              {...activate(onIsolate)}
              disabled={!canAct}
              className={`${
                isolated ? "btn-primary" : "btn-soft"
              } inline-flex h-9 items-center rounded-full px-3 text-[12px] font-medium disabled:opacity-30`}
            >
              Only this
            </button>
            <button
              type="button"
              {...activate(onDismiss)}
              className="inline-flex h-9 items-center rounded-full px-3 text-[12px] font-medium text-neutral-600 hover:bg-neutral-100"
            >
              Close
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
