"use client";

import { useState } from "react";
import type { Part } from "@/lib/api/types";
import type { ManualSubAssemblyGroup } from "@/types";
import {
  assemblyKeyForPart,
  groupForPart,
  manualChildAsPart,
} from "@/lib/manual-sub-assembly";
import { PartLifecycleNotice } from "@/components/part-lifecycle/PartLifecycleNotice";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
    >
      <path fill="currentColor" d="M7 4l6 6-6 6V4z" />
    </svg>
  );
}

export function ManualSubAssemblyChildRow({
  part,
  selected,
  onSelect,
  onAdd,
  showAdd,
  nested,
}: {
  part: Part;
  selected: boolean;
  onSelect: (part: Part) => void;
  onAdd?: (part: Part) => void;
  showAdd?: boolean;
  nested?: boolean;
}) {
  return (
    <div
      className={`flex min-h-12 w-full items-center gap-3 py-2 ${
        nested ? "pl-8 pr-4" : "px-4"
      } ${selected ? "row-on-ink" : ""}`}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSelect(part);
        }}
        className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-medium">{part.name}</span>
          <span
            className={`block truncate font-mono text-xs ${
              selected ? "row-on-ink-muted" : "spares-muted"
            }`}
          >
            {part.id}
            {part.vendor ? ` · ${part.vendor}` : ""}
          </span>
          <PartLifecycleNotice
            lifecycle={part.lifecycle}
            compact
            onLightBackground={selected}
          />
        </span>
        <span
          className={`tabular-nums text-sm ${selected ? "row-on-ink-muted" : "spares-muted"}`}
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
          className="btn-accent inline-flex h-9 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold"
        >
          Add
        </button>
      ) : null}
    </div>
  );
}

export function ManualSubAssemblyCollapse({
  parent,
  group,
  selectedPartId,
  onSelect,
  onAdd,
  showAdd,
}: {
  parent: Part;
  group: ManualSubAssemblyGroup;
  selectedPartId: string | null;
  onSelect: (part: Part) => void;
  onAdd?: (part: Part) => void;
  showAdd?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const count = group.children.length;
  if (count === 0) {
    return null;
  }

  return (
    <li data-manual-sub-assembly="">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-10 w-full items-center gap-2 px-4 py-1 text-left text-[13px] font-medium spares-muted"
        aria-expanded={open}
      >
        <Chevron open={open} />
        <span>
          {count} manual sub-part{count === 1 ? "" : "s"}
        </span>
      </button>
      {open ? (
        <ul>
          {group.children.map((child) => {
            const part = manualChildAsPart(child, parent);
            const selected = part.id === selectedPartId;
            return (
              <li key={`${assemblyKeyForPart(parent)}:${child.id}`}>
                <ManualSubAssemblyChildRow
                  part={part}
                  selected={selected}
                  onSelect={onSelect}
                  onAdd={onAdd}
                  showAdd={showAdd}
                  nested
                />
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

export function manualGroupForParent(
  groups: ManualSubAssemblyGroup[] | undefined,
  parent: Part,
) {
  return groupForPart(groups, parent);
}
