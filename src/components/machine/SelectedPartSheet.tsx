"use client";

import type { Part } from "@/lib/api/types";

export function SelectedPartSheet({
  part,
  onHide,
  onIsolate,
  onAdd,
  showAdd,
  dimmed,
  held,
}: {
  part: Part | null;
  onHide: () => void;
  onIsolate: () => void;
  onAdd?: () => void;
  showAdd?: boolean;
  dimmed?: boolean;
  held?: boolean;
}) {
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 h-36 px-3 pb-3 chrome-fade ${
        dimmed ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100"
      }`}
    >
      <div className="pointer-events-auto flex h-full flex-col justify-between rounded-[22px] bg-white/92 px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.18)] ring-1 ring-black/5 backdrop-blur-xl">
        <div className="min-h-[3.25rem]">
          <p className="truncate text-[17px] leading-tight font-semibold tracking-tight text-neutral-950">
            {part ? part.name : "Tap a part"}
          </p>
          <p className="mt-1 truncate font-mono text-[13px] text-neutral-500">
            {part ? part.id : "Hold to hide or see only that part."}
          </p>
        </div>
        <div
          className={`flex flex-wrap gap-2 ${held ? "scale-[1.02]" : "scale-100"} chrome-fade`}
        >
          <button
            type="button"
            onClick={onHide}
            disabled={!part}
            className="inline-flex h-11 min-w-11 items-center justify-center rounded-full bg-neutral-100 px-4 text-sm font-medium text-neutral-900 disabled:opacity-30"
          >
            Hide
          </button>
          <button
            type="button"
            onClick={onIsolate}
            disabled={!part}
            className="inline-flex h-11 min-w-11 items-center justify-center rounded-full bg-neutral-100 px-4 text-sm font-medium text-neutral-900 disabled:opacity-30"
          >
            See only this
          </button>
          {showAdd && onAdd ? (
            <button
              type="button"
              onClick={onAdd}
              disabled={!part}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-[#0a84ff] px-4 text-sm font-semibold text-white disabled:opacity-30"
            >
              Add
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
