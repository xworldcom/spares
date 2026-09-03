"use client";

import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import type { ViewerPickerProps } from "@/components/viewer/types";

type ViewerSlotProps = Omit<ViewerPickerProps, "fileUrl"> & {
  fileUrl: string | null;
  loadError?: string | null;
};

/**
 * Mount point for Drew’s picker. This is not a 3D engine.
 * Until T1.1 lands here, the viewport is an empty slot and pick
 * happens from the ETO parts list in the surrounding chrome.
 */
export function ViewerSlot({
  fileUrl,
  parts,
  selectedPartId,
  onPick,
  loadError,
  className,
}: ViewerSlotProps) {
  if (loadError) {
    return (
      <ErrorState
        title="Failed to load the 3D model"
        message={loadError}
      />
    );
  }

  if (!fileUrl) {
    return (
      <EmptyState
        title="No model"
        message="This machine pack does not have a GLB or GLTF file to display."
      />
    );
  }

  const selected = parts.find((part) => part.id === selectedPartId) ?? null;

  return (
    <div
      className={
        className ??
        "relative flex min-h-[22rem] flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-100"
      }
      data-viewer-slot="true"
      data-file-url={fileUrl}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[length:24px_24px]" />
      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <p className="text-xs font-medium tracking-wide text-neutral-400 uppercase">
          Viewer slot · T1.1
        </p>
        <p className="mt-2 max-w-sm text-sm text-neutral-200">
          Drew’s picker mounts here. Rotate, zoom, and mesh pick live in{" "}
          <code className="text-neutral-100">src/components/viewer</code>.
        </p>
        <p className="mt-3 text-xs text-neutral-500">
          Model URL is ready. Until the picker lands, select a named part from
          the BOM.
        </p>
        {selected ? (
          <button
            type="button"
            onClick={() => onPick(null)}
            className="mt-4 rounded-md border border-neutral-600 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
          >
            Clear pick
          </button>
        ) : null}
      </div>
    </div>
  );
}
