"use client";

import type { Part } from "@/lib/api/types";

export function PartsBom({
  parts,
  selectedPartId,
  onSelect,
}: {
  parts: Part[];
  selectedPartId: string | null;
  onSelect: (part: Part) => void;
}) {
  if (parts.length === 0) {
    return (
      <p className="text-sm text-neutral-600">
        No joined parts. Staff should check unmatched meshes after upload.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <caption className="sr-only">ETO-shaped parts list</caption>
        <thead className="bg-neutral-100 text-xs tracking-wide text-neutral-600 uppercase">
          <tr>
            <th className="px-3 py-2 font-medium">Part number</th>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Qty</th>
            <th className="px-3 py-2 font-medium">Mesh</th>
          </tr>
        </thead>
        <tbody>
          {parts.map((part) => {
            const selected = part.id === selectedPartId;
            return (
              <tr
                key={part.id}
                className={
                  selected
                    ? "bg-neutral-900 text-white"
                    : "cursor-pointer text-neutral-800 hover:bg-neutral-50"
                }
              >
                <td className="px-3 py-2 font-mono text-xs">
                  <button
                    type="button"
                    onClick={() => onSelect(part)}
                    className="w-full text-left"
                  >
                    {part.id}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onSelect(part)}
                    className="w-full text-left"
                  >
                    {part.name}
                  </button>
                </td>
                <td className="px-3 py-2 tabular-nums">{part.qty}</td>
                <td
                  className={
                    selected
                      ? "px-3 py-2 font-mono text-xs text-neutral-300"
                      : "px-3 py-2 font-mono text-xs text-neutral-500"
                  }
                >
                  {part.meshName}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
