"use client";

import type { PartPickerProps } from "@/components/viewer/types";

/**
 * Mount slot for Drew’s picker. This is not a 3D engine.
 * Replace the body of this component with rotate/zoom/pan/highlight.
 * Keep these props exactly: `src`, `parts`, `onSelect`.
 */
export function PartPicker({ src, parts }: PartPickerProps) {
  return (
    <div
      className="relative flex min-h-[22rem] flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-100"
      data-part-picker="true"
      data-src={src}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[length:24px_24px]" />
      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <p className="text-xs font-medium tracking-wide text-neutral-400 uppercase">
          PartPicker · T1.1
        </p>
        <p className="mt-2 max-w-sm text-sm text-neutral-200">
          Drew’s picker mounts here. Rotate, zoom, pan, and highlight live in{" "}
          <code className="text-neutral-100">src/components/viewer</code>.
        </p>
        <p className="mt-3 text-xs text-neutral-500">
          <code className="text-neutral-400">src</code> is the cookie-authenticated
          model file. Until the picker lands, select a joined named part from
          the BOM.
        </p>
        {parts.length === 0 ? (
          <p className="mt-3 text-xs text-neutral-500">
            No joined parts to pick.
          </p>
        ) : null}
        <span className="sr-only">
          {src} · {parts.length} joined parts
        </span>
      </div>
    </div>
  );
}
