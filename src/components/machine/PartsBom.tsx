"use client";

import { Fragment, useMemo, useState, type MouseEvent } from "react";
import { CatalogSearch } from "@/components/catalog/CatalogSearch";
import type { Part } from "@/lib/api/types";
import type { ManualSubAssemblyGroup } from "@/types";
import { PartLifecycleNotice } from "@/components/part-lifecycle/PartLifecycleNotice";
import { partMatchesBomFilter } from "@/components/machine/parts-bom-filter";
import {
  BomTreeParentRow,
  ManualSubAssemblyChildListItems,
  manualGroupForParent,
  useManualSubAssemblyTree,
} from "@/components/machine/ManualSubAssemblyRows";

function PartRowSelectButton({
  part,
  selected,
  onSelect,
}: {
  part: Part;
  selected: boolean;
  onSelect: (part: Part) => void;
}) {
  function selectRow(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest("button, a, input, textarea, select")) {
      return;
    }
    event.stopPropagation();
    onSelect(part);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={selectRow}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(part);
        }
      }}
      aria-selected={selected}
      className="bom-data-row bom-data-row--grid bom-data-row--no-add bom-data-row--hit w-full min-w-0 py-1"
    >
      <span className="bom-row-main min-w-0 text-left">
        <span className="bom-row-text min-w-0">
          <span className="block text-[15px] font-medium leading-snug break-words [overflow-wrap:anywhere] line-clamp-2">
            {part.name}
          </span>
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
      </span>
      <span
        className={`bom-qty-col tabular-nums text-sm ${
          selected ? "row-on-ink-muted" : "spares-muted"
        }`}
      >
        {part.qty}
      </span>
    </div>
  );
}

function PartsBomTreeEntry({
  part,
  manualGroup,
  selectedPartId,
  onSelect,
  onAdd,
  showAdd,
}: {
  part: Part;
  manualGroup?: ManualSubAssemblyGroup;
  selectedPartId: string | null;
  onSelect: (part: Part) => void;
  onAdd?: (part: Part) => void;
  showAdd?: boolean;
}) {
  const selected = part.id === selectedPartId;
  const tree = useManualSubAssemblyTree(manualGroup);

  function selectFromRow(event: MouseEvent<HTMLLIElement>) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (
      target.closest(
        "button, a, input, textarea, select, [data-bom-row-skip-select]",
      )
    ) {
      return;
    }
    onSelect(part);
  }

  return (
    <Fragment>
      <li
        className={`bom-tree-parent-li ${selected ? "row-on-ink" : ""}`}
        onClick={selectFromRow}
      >
        <BomTreeParentRow
          hasChildren={tree.hasChildren}
          expand={
            tree.hasChildren
              ? { open: tree.open, count: tree.count, onToggle: tree.toggle }
              : undefined
          }
          count={tree.count}
          selected={selected}
          nameCell={
            <PartRowSelectButton part={part} selected={selected} onSelect={onSelect} />
          }
          trailing={
            showAdd && onAdd ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onAdd(part);
                }}
                className="bom-add-col btn-accent inline-flex h-11 min-h-11 shrink-0 items-center justify-center rounded-full px-3 text-[13px] font-semibold shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] data-[selected]:shadow-[inset_0_0_0_2px_rgba(255,255,255,0.35)]"
                data-selected={selected ? "" : undefined}
              >
                Add
              </button>
            ) : null
          }
        />
      </li>
      {tree.open && manualGroup ? (
        <ManualSubAssemblyChildListItems
          parent={part}
          group={manualGroup}
          selectedPartId={selectedPartId}
          onSelect={onSelect}
          onAdd={onAdd}
          showAdd={showAdd}
        />
      ) : null}
    </Fragment>
  );
}

export function PartsBom({
  parts,
  manualSubAssemblies,
  selectedPartId,
  onSelect,
  onAdd,
  showAdd,
  searchable = false,
}: {
  parts: Part[];
  manualSubAssemblies?: ManualSubAssemblyGroup[];
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
  const filtered = useMemo(
    () => parts.filter((part) => partMatchesBomFilter(part, query, category)),
    [parts, query, category],
  );

  const pinnedSelection = useMemo(() => {
    if (!selectedPartId) {
      return null;
    }
    const selected = parts.find((part) => part.id === selectedPartId);
    if (!selected || partMatchesBomFilter(selected, query, category)) {
      return null;
    }
    return selected;
  }, [parts, selectedPartId, query, category]);

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
          <CatalogSearch
            id="parts-bom-search"
            label="Search parts"
            value={query}
            onChange={setQuery}
            placeholder="Search name, number, vendor"
          />
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
      {filtered.length === 0 && !pinnedSelection ? (
        <p className="spares-muted text-sm">No parts match that search.</p>
      ) : (
        <ul className="spares-surface overflow-hidden rounded-[22px]">
          {pinnedSelection ? (
            <li key={`pinned:${pinnedSelection.id}`} data-bom-pinned-selection="">
              <div className="flex min-h-14 w-full items-center gap-3 px-4 py-2 row-on-ink">
                <PartRowSelectButton
                  part={pinnedSelection}
                  selected
                  onSelect={onSelect}
                />
                <span className="shrink-0 rounded-full bg-white/12 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
                  Selected
                </span>
                {showAdd && onAdd ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onAdd(pinnedSelection);
                    }}
                    className="btn-accent inline-flex h-9 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold"
                    data-selected=""
                  >
                    Add
                  </button>
                ) : null}
              </div>
            </li>
          ) : null}
          {filtered.map((part) => (
            <PartsBomTreeEntry
              key={part.id}
              part={part}
              manualGroup={manualGroupForParent(manualSubAssemblies, part)}
              selectedPartId={selectedPartId}
              onSelect={onSelect}
              onAdd={onAdd}
              showAdd={showAdd}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
