import type { Part } from "@/lib/api/types";

export function SelectedPartPanel({ part }: { part: Part | null }) {
  if (!part) {
    return (
      <div className="spares-surface rounded-lg border border-dashed border-white/12 px-4 py-4">
        <p className="text-sm font-medium">No part selected</p>
        <p className="spares-muted mt-1 text-sm">
          Click a named part in the viewer or in the BOM.
        </p>
      </div>
    );
  }

  return (
    <div className="spares-surface rounded-lg border border-white/8 px-4 py-4">
      <p className="spares-muted text-xs font-medium tracking-wide uppercase">
        Selected part
      </p>
      <p className="mt-1 text-lg font-semibold">{part.name}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="spares-muted">Part number</dt>
          <dd className="font-mono">{part.id}</dd>
        </div>
        <div>
          <dt className="spares-muted">Qty</dt>
          <dd className="tabular-nums">{part.qty}</dd>
        </div>
        <div className="col-span-2">
          <dt className="spares-muted">Mesh</dt>
          <dd className="font-mono">{part.meshName}</dd>
        </div>
      </dl>
    </div>
  );
}
