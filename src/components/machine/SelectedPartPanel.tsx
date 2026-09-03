import type { Part } from "@/lib/api/types";

export function SelectedPartPanel({ part }: { part: Part | null }) {
  if (!part) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 bg-white px-4 py-4">
        <p className="text-sm font-medium text-neutral-900">No part selected</p>
        <p className="mt-1 text-sm text-neutral-600">
          Click a named part in the viewer or in the BOM.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-4 py-4">
      <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
        Selected part
      </p>
      <p className="mt-1 text-lg font-semibold text-neutral-900">{part.name}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-neutral-500">Part number</dt>
          <dd className="font-mono text-neutral-900">{part.id}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Qty</dt>
          <dd className="tabular-nums text-neutral-900">
            {typeof part.qty === "number" ? part.qty : "—"}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-neutral-500">Mesh</dt>
          <dd className="font-mono text-neutral-700">{part.meshName}</dd>
        </div>
      </dl>
    </div>
  );
}
