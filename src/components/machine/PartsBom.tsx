"use client";

import { useMemo, useRef, useState } from "react";
import type { Part } from "@/lib/api/types";
import { PartLifecycleNotice } from "@/components/part-lifecycle/PartLifecycleNotice";
import { createTapGesture, tapActivateHandlers } from "@/lib/ui/tap-gesture";

function PartRowSelectButton({
  part,
  selected,
  onSelect,
}: {
  part: Part;
  selected: boolean;
  onSelect: (part: Part) => void;
}) {
  const gesture = useRef(createTapGesture());
  const handlers = useMemo(
    () => tapActivateHandlers(gesture.current, () => onSelect(part)),
    [onSelect, part],
  );

  return (
    <button
      type="button"
      {...handlers}
      className="flex min-w-0 flex-1 items-center justify-between gap-3 py-1 text-left"
    >
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-medium">{part.name}</span>
        <span
          className={`block truncate font-mono text-xs ${
            selected ? "row-on-ink-muted" : "spares-muted"
          }`}
        >
          {part.id}
          {part.replaces ? ` · replaces ${part.replaces}` : ""}
        </span>
        <PartLifecycleNotice lifecycle={part.lifecycle} compact />
      </span>
      <span
        className={`tabular-nums text-sm ${selected ? "row-on-ink-muted" : "spares-muted"}`}
      >
        {part.qty}
      </span>
    </button>
  );
}

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
  const [category, setCategory] = useState("");
  const categories = useMemo(() => {
    return [...new Set(parts.map((part) => part.category).filter(Boolean))] as string[];
  }, [parts]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return parts.filter((part) => {
      if (category && (part.category ?? "") !== category) {
        return false;
      }
      if (!needle) {
        return true;
      }
      const hay = [
        part.name,
        part.id,
        part.meshName,
        part.vendor,
        part.material,
        part.replaces,
        part.category,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [parts, query, category]);

  if (parts.length === 0) {
    return (
      <p className="spares-muted text-sm">
        No parts are listed on this machine yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {searchable ? (
        <div className="space-y-2">
          <label className="block">
            <span className="sr-only">Search parts</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, number, vendor"
              className="spares-field h-12 w-full rounded-2xl border-0 px-4 text-[16px] outline-none"
            />
          </label>
          {categories.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setCategory("")}
                className={`inline-flex h-9 items-center rounded-full px-3 text-[13px] font-medium ${
                  category === "" ? "btn-primary" : "btn-soft"
                }`}
              >
                All
              </button>
              {categories.map((row) => (
                <button
                  key={row}
                  type="button"
                  onClick={() => setCategory(row)}
                  className={`inline-flex h-9 items-center rounded-full px-3 text-[13px] font-medium ${
                    category === row ? "btn-primary" : "btn-soft"
                  }`}
                >
                  {row}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {filtered.length === 0 ? (
        <p className="spares-muted text-sm">No parts match that search.</p>
      ) : (
        <ul data-parts-bom="" className="spares-surface overflow-hidden rounded-[22px]">
          {filtered.map((part) => {
            const selected = part.id === selectedPartId;
            return (
              <li key={part.id}>
                <div
                  className={`flex min-h-14 w-full items-center gap-3 px-4 py-2 ${
                    selected ? "row-on-ink" : ""
                  }`}
                >
                  <PartRowSelectButton
                    part={part}
                    selected={selected}
                    onSelect={onSelect}
                  />
                  {showAdd && onAdd ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onAdd(part);
                      }}
                      className={`${
                        selected ? "btn-primary" : "btn-accent"
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
