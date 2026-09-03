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
      <p className="text-sm text-neutral-500">
        No joined parts. Staff should check unmatched meshes after upload.
      </p>
    );
  }

  return (
    <ul className="overflow-hidden rounded-[22px] bg-white">
      {parts.map((part) => {
        const selected = part.id === selectedPartId;
        return (
          <li key={part.id}>
            <button
              type="button"
              onPointerDown={() => onSelect(part)}
              onClick={() => onSelect(part)}
              className={`flex min-h-14 w-full items-center justify-between gap-4 px-5 py-3 text-left chrome-fade ${
                selected
                  ? "bg-neutral-950 text-white"
                  : "text-neutral-800 hover:bg-neutral-50"
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium">{part.name}</span>
                <span
                  className={`block truncate font-mono text-xs ${
                    selected ? "text-white/60" : "text-neutral-400"
                  }`}
                >
                  {part.id}
                </span>
              </span>
              <span className={`tabular-nums text-sm ${selected ? "text-white/70" : "text-neutral-400"}`}>
                {part.qty}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
