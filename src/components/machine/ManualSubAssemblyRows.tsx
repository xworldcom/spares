"use client";

import { Fragment, useState, type ReactNode } from "react";
import type { Part } from "@/lib/api/types";
import type { ManualSubAssemblyGroup } from "@/types";
import {
  assemblyKeyForPart,
  groupForPart,
  manualChildAsPart,
} from "@/lib/manual-sub-assembly";
import { PartLifecycleNotice } from "@/components/part-lifecycle/PartLifecycleNotice";

const TREE_GUIDE_OFFSET_LIST = "2.25rem";
const TREE_INDENT_LIST = "1.25rem";
const TREE_GUIDE_OFFSET_SHEET = "0.5rem";
const TREE_INDENT_SHEET = "0.75rem";

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

export function ManualSubAssemblyCountBadge({
  count,
  selected,
}: {
  count: number;
  selected?: boolean;
}) {
  if (count <= 0) {
    return null;
  }
  return (
    <span
      className={`inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
        selected
          ? "bg-[var(--spares-on-ink)]/14 text-[var(--spares-on-ink)]"
          : "bg-white/10"
      }`}
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
      onPointerUp={(event) => {
        event.currentTarget.blur();
      }}
      className="inline-flex h-11 w-11 min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-[var(--spares-on-surface)] spares-muted hover:bg-white/6 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      aria-expanded={open}
      aria-label={open ? "Collapse sub-parts" : `Expand ${count} sub-part${count === 1 ? "" : "s"}`}
    >
      <Chevron open={open} />
    </button>
  );
}

export function CustomerBomPartRow({
  part,
  selected,
  onSelect,
  onAdd,
  showAdd,
}: {
  part: Part;
  selected: boolean;
  onSelect: (part: Part) => void;
  onAdd?: (part: Part) => void;
  showAdd?: boolean;
}) {
  return (
    <div className="flex min-h-[37px] w-full items-center gap-2 py-1">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSelect(part);
        }}
        className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
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
          className="btn-accent inline-flex h-11 min-h-11 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] data-[selected]:shadow-[inset_0_0_0_2px_rgba(255,255,255,0.35)]"
          data-selected={selected ? "" : undefined}
        >
          Add
        </button>
      ) : null}
    </div>
  );
}

export function StaffCatalogPartRow({
  partNumber,
  name,
  qty,
  selected,
  onSelect,
  secondaryLine,
}: {
  partNumber: string;
  name: string;
  qty: number;
  selected: boolean;
  onSelect: () => void;
  secondaryLine?: string;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      className="flex min-h-[37px] w-full items-center gap-3 py-1 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{name}</span>
        <span
          className={`block truncate font-mono text-xs ${
            selected ? "row-on-ink-muted" : "spares-muted"
          }`}
        >
          {partNumber}
          {secondaryLine ? `  ·  ${secondaryLine}` : ""}
        </span>
      </span>
      <span
        className={`shrink-0 tabular-nums text-sm ${
          selected ? "row-on-ink-muted" : "spares-muted"
        }`}
      >
        {qty}
      </span>
    </button>
  );
}

function ManualSubTreeChildShell({
  selected,
  children,
  treeLayout = "list",
}: {
  selected: boolean;
  children: ReactNode;
  treeLayout?: "list" | "sheet";
}) {
  const marginLeft =
    treeLayout === "sheet" ? TREE_GUIDE_OFFSET_SHEET : TREE_GUIDE_OFFSET_LIST;
  const paddingLeft =
    treeLayout === "sheet" ? TREE_INDENT_SHEET : TREE_INDENT_LIST;
  return (
    <li
      data-manual-sub-part=""
      className={`border-t border-white/6 ${selected ? "row-on-ink" : ""}`}
    >
      <div
        className="relative pr-4"
        style={{
          marginLeft,
          paddingLeft,
          borderLeft: "1px solid rgba(255,255,255,0.14)",
        }}
      >
        {children}
      </div>
    </li>
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
  variant = "customer",
  treeLayout = "list",
}: {
  parent: Part;
  group: ManualSubAssemblyGroup;
  selectedPartId: string | null;
  onSelect: (part: Part) => void;
  onAdd?: (part: Part) => void;
  showAdd?: boolean;
  compact?: boolean;
  variant?: "customer" | "staff";
  treeLayout?: "list" | "sheet";
}) {
  return (
    <>
      {group.children.map((child) => {
        const part = manualChildAsPart(child, parent);
        const selected = part.id === selectedPartId;
        return (
          <ManualSubTreeChildShell
            key={`${assemblyKeyForPart(parent)}:${child.id}`}
            selected={selected}
            treeLayout={treeLayout}
          >
            {variant === "staff" ? (
              <StaffCatalogPartRow
                partNumber={part.id}
                name={part.name}
                qty={part.qty}
                selected={selected}
                onSelect={() => onSelect(part)}
              />
            ) : (
              <CustomerBomPartRow
                part={part}
                selected={selected}
                onSelect={onSelect}
                onAdd={onAdd}
                showAdd={showAdd && !compact}
              />
            )}
          </ManualSubTreeChildShell>
        );
      })}
    </>
  );
}

/** @deprecated Use CustomerBomPartRow via tree helpers. */
export function ManualSubAssemblyChildRow(props: {
  part: Part;
  selected: boolean;
  onSelect: (part: Part) => void;
  onAdd?: (part: Part) => void;
  showAdd?: boolean;
  nested?: boolean;
}) {
  return (
    <CustomerBomPartRow
      part={props.part}
      selected={props.selected}
      onSelect={props.onSelect}
      onAdd={props.onAdd}
      showAdd={props.showAdd}
    />
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
