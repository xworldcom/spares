import type { UnmatchedPart } from "@/lib/api/types";

export function UnmatchedMeshes({ unmatched }: { unmatched: UnmatchedPart[] }) {
  if (unmatched.length === 0) {
    return (
      <div className="rounded-[22px] bg-white px-4 py-3 text-sm text-neutral-700">
        All list rows joined to a mesh. No unmatched meshes.
      </div>
    );
  }

  return (
    <section
      aria-labelledby="unmatched-heading"
      className="rounded-[22px] bg-amber-50 px-4 py-4"
    >
      <h2 id="unmatched-heading" className="text-sm font-semibold text-amber-950">
        Unmatched meshes
      </h2>
      <p className="mt-1 text-sm text-amber-900">
        Staff only. These list rows or 3D meshes did not join on part number /
        mesh name. They are not hidden.
      </p>
      <ul className="mt-3 space-y-2">
        {unmatched.map((row, index) => (
          <li
            key={`${row.source}-${row.id ?? row.meshName ?? index}`}
            className="rounded-md bg-white/70 px-3 py-2 text-sm text-amber-950"
          >
            <span className="font-medium capitalize">{row.source}</span>
            {row.id ? (
              <span className="ml-2 font-mono text-xs">{row.id}</span>
            ) : null}
            {row.name ? <span className="ml-2">{row.name}</span> : null}
            {typeof row.qty === "number" ? (
              <span className="ml-2 tabular-nums">qty {row.qty}</span>
            ) : null}
            {row.meshName ? (
              <span className="ml-2 font-mono text-xs text-amber-800">
                mesh: {row.meshName}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
