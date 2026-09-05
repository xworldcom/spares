"use client";

import { useMemo, useState } from "react";
import type { Part } from "@/lib/api/types";

export function PartsBom({
  parts,
  selectedPartId,
  onSelect,
  onAdd,
  showAdd,
  searchable = false,
}: {
  parts: Part[];
  selectedPartId: string | null;
  onSelect: (part: Part) => void;
  onAdd?: (part: Part) => void;
  showAdd?: boolean;
  searchable?: boolean;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return parts;
    }
    return parts.filter((part) => {
      const hay = `${part.name} ${part.id} ${part.meshName}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [parts, query]);

  if (parts.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        No parts are listed on this machine yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {searchable ? (
        <label className="block">
          <span className="sr-only">Search parts</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or part number"
            className="h-12 w-full rounded-2xl border-0 bg-white px-4 text-[16px] outline-none ring-1 ring-black/8"
          />
        </label>
      ) : null}
      {filtered.length === 0 ? (
        <p className="text-sm text-neutral-500">No parts match that search.</p>
      ) : (
        <ul data-parts-bom="" className="overflow-hidden rounded-[22px] bg-white">
          {filtered.map((part) => {
            const selected = part.id === selectedPartId;
            return (
              <li key={part.id}>
                <div
                  className={`flex min-h-14 w-full items-center gap-3 px-4 py-2 ${
                    selected ? "row-on-ink" : "text-neutral-800"
                  }`}
                >
                  <button
                    type="button"
                    onPointerDown={() => onSelect(part)}
                    onClick={() => onSelect(part)}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 py-1 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-medium">
                        {part.name}
                      </span>
                      <span
                        className={`block truncate font-mono text-xs ${
                          selected ? "row-on-ink-muted" : "spares-muted"
                        }`}
                      >
                        {part.id}
                      </span>
                    </span>
                    <span
                      className={`tabular-nums text-sm ${
                        selected ? "row-on-ink-muted" : "spares-muted"
                      }`}
                    >
                      {part.qty}
                    </span>
                  </button>
                  {showAdd && onAdd ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onAdd(part);
                      }}
                      className={`${
                        selected ? "bg-white text-[#0b0d10]" : "btn-accent"
                      } inline-flex h-9 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold`}
                    >
                      Add
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}