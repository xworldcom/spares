"use client";

import { Fragment, useState } from "react";
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

export function ManualSubAssemblyCountBadge({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }
  return (
    <span
      className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-white/10 px-1.5 text-[11px] font-semibold tabular-nums"
      aria-label={`${count} sub-part${count === 1 ? "" : "s"}`}
    >
      {count}
    </span>
  );
}

export function ManualSubAssemblyExpandButton({
  open,
  count,
  onToggle,
}: {
  open: boolean;
  count: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        onToggle();
      }}
      className="inline-flex h-11 w-9 shrink-0 items-center justify-center rounded-full text-[var(--spares-on-surface)] spares-muted hover:bg-white/6"
      aria-expanded={open}
      aria-label={open ? "Collapse sub-parts" : `Expand ${count} sub-part${count === 1 ? "" : "s"}`}
    >
      <Chevron open={open} />
    </button>
  );
}

function BomStylePartRow({
  part,
  selected,
  onSelect,
  onAdd,
  showAdd,
  nested,
  compact,
}: {
  part: Part;
  selected: boolean;
  onSelect: (part: Part) => void;
  onAdd?: (part: Part) => void;
  showAdd?: boolean;
  nested?: boolean;
  compact?: boolean;
}) {
  const titleClass = compact ? "text-[13px]" : "text-[15px]";
  const rowMinH = compact ? "min-h-11" : "min-h-14";
  return (
    <div
      className={`flex w-full items-center gap-2 ${rowMinH} py-2 ${
        nested ? "pl-11 pr-4" : "px-4"
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
          <span className={`block truncate font-medium ${titleClass}`}>{part.name}</span>
          <span
            className={`block truncate font-mono text-xs ${
              selected ? "row-on-ink-muted" : "spares-muted"
            }`}
          >
            {part.id}
            {part.replaces ? ` · replaces ${part.replaces}` : ""}
            {part.vendor && !part.replaces ? ` · ${part.vendor}` : ""}
          </span>
          <PartLifecycleNotice
            lifecycle={part.lifecycle}
            compact
            onLightBackground={selected}
          />
        </span>
        <span
          className={`shrink-0 tabular-nums text-sm ${
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
          className="btn-accent inline-flex h-9 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] data-[selected]:shadow-[inset_0_0_0_2px_rgba(255,255,255,0.35)]"
          data-selected={selected ? "" : undefined}
        >
          Add
        </button>
      ) : null}
    </div>
  );
}

/** @deprecated Use BomStylePartRow via tree helpers; kept for sheet imports migrating off. */
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
    <BomStylePartRow
      part={part}
      selected={selected}
      onSelect={onSelect}
      onAdd={onAdd}
      showAdd={showAdd}
      nested={nested}
      compact={nested}
    />
  );
}

export function ManualSubAssemblyChildListItems({
  parent,
  group,
  selectedPartId,
  onSelect,
  onAdd,
  showAdd,
  compact,
}: {
  parent: Part;
  group: ManualSubAssemblyGroup;
  selectedPartId: string | null;
  onSelect: (part: Part) => void;
  onAdd?: (part: Part) => void;
  showAdd?: boolean;
  compact?: boolean;
}) {
  return (
    <>
      {group.children.map((child) => {
        const part = manualChildAsPart(child, parent);
        const selected = part.id === selectedPartId;
        return (
          <li
            key={`${assemblyKeyForPart(parent)}:${child.id}`}
            data-manual-sub-part=""
            className="border-t border-white/6"
          >
            <BomStylePartRow
              part={part}
              selected={selected}
              onSelect={onSelect}
              onAdd={onAdd}
              showAdd={showAdd}
              nested
              compact={compact}
            />
          </li>
        );
      })}
    </>
  );
}

export function useManualSubAssemblyTree(group: ManualSubAssemblyGroup | undefined) {
  const [open, setOpen] = useState(false);
  const count = group?.children.length ?? 0;
  const hasChildren = count > 0;
  return {
    open: hasChildren ? open : false,
    setOpen,
    toggle: () => setOpen((value) => !value),
    count,
    hasChildren,
  };
}

/** Legacy block renderer — prefer inline tree on the parent row. */
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
  const tree = useManualSubAssemblyTree(group);
  if (!tree.hasChildren) {
    return null;
  }

  return (
    <Fragment>
      <li data-manual-sub-assembly="">
        <button
          type="button"
          onClick={() => tree.toggle()}
          className="flex min-h-10 w-full items-center gap-2 px-4 py-1 text-left text-[13px] font-medium spares-muted"
          aria-expanded={tree.open}
        >
          <Chevron open={tree.open} />
          <span>
            {tree.count} manual sub-part{tree.count === 1 ? "" : "s"}
          </span>
        </button>
      </li>
      {tree.open ? (
        <ManualSubAssemblyChildListItems
          parent={parent}
          group={group}
          selectedPartId={selectedPartId}
          onSelect={onSelect}
          onAdd={onAdd}
          showAdd={showAdd}
        />
      ) : null}
    </Fragment>
  );
}

export function manualGroupForParent(
  groups: ManualSubAssemblyGroup[] | undefined,
  parent: Part,
) {
  return groupForPart(groups, parent);
}
