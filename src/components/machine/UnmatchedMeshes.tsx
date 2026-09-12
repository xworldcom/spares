import type { UnmatchedPart } from "@/lib/api/types";

export function UnmatchedMeshes({ unmatched }: { unmatched: UnmatchedPart[] }) {
  const rows = Array.isArray(unmatched) ? unmatched : [];
  if (rows.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="unmatched-heading"
      className="rounded-[22px] bg-[#2a2214] px-4 py-4"
    >
      <h2 id="unmatched-heading" className="text-sm font-semibold text-[#f0d9a8]">
        Join notes
      </h2>
      <p className="mt-1 text-sm text-[#e8c27a]">
        These rows or meshes did not line up on part number. They stay in
        the model; they are not quote items.
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map((row, index) => (
          <li
            key={`${row.source}-${row.id ?? row.meshName ?? index}`}
            className="rounded-md bg-black/25 px-3 py-2 text-sm text-[#f0d9a8]"
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
              <span className="ml-2 font-mono text-xs text-[#e8c27a]">
                mesh: {row.meshName}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
