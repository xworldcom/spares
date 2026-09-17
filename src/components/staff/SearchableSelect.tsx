"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { catalogQueryMatch } from "@/lib/ui/catalog-query";

export type SearchableOption = {
  value: string;
  label: string;
};

const CREATE_VALUE = "__create__";

export function SearchableSelect({
  id: idProp,
  label,
  options,
  value,
  onChange,
  placeholder = "Type to search…",
  disabled = false,
  allowEmpty = false,
  emptyLabel = "None",
  onCreate,
  canCreate,
  createLabel,
}: {
  id?: string;
  label: string;
  options: readonly SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  onCreate?: (query: string) => void;
  canCreate?: (query: string) => boolean;
  createLabel?: (query: string) => string;
}) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const listId = `${id}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = useMemo(
    () => options.find((row) => row.value === value) ?? null,
    [options, value],
  );

  const createQuery = query.trim();

  const filtered = useMemo(() => {
    const rows = options.filter((row) => catalogQueryMatch(query, [row.label, row.value]));
    const next =
      allowEmpty && catalogQueryMatch(query, [emptyLabel, ""])
        ? [{ value: "", label: emptyLabel }, ...rows]
        : rows;
    if (
      onCreate &&
      createQuery &&
      (canCreate ? canCreate(createQuery) : true)
    ) {
      return [
        ...next,
        {
          value: CREATE_VALUE,
          label: createLabel?.(createQuery) ?? `Add “${createQuery}”`,
        },
      ];
    }
    return next;
  }, [allowEmpty, canCreate, createLabel, createQuery, emptyLabel, onCreate, options, query]);

  useEffect(() => {
    if (!open) {
      setQuery(selected?.label ?? "");
    }
  }, [open, selected]);

  useEffect(() => {
    if (activeIndex >= filtered.length) {
      setActiveIndex(Math.max(0, filtered.length - 1));
    }
  }, [activeIndex, filtered.length]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function choose(nextValue: string) {
    if (nextValue === CREATE_VALUE) {
      onCreate?.(createQuery);
      setOpen(false);
      return;
    }
    onChange(nextValue);
    const next = options.find((row) => row.value === nextValue);
    setQuery(next?.label ?? (nextValue ? nextValue : emptyLabel));
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="searchable-select">
      <label htmlFor={id} className="searchable-select-label">
        {label}
      </label>
      <div className="searchable-select-field">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && filtered[activeIndex]
              ? `${id}-option-${filtered[activeIndex].value || "empty"}`
              : undefined
          }
          disabled={disabled}
          value={open ? query : selected?.label ?? query}
          placeholder={placeholder}
          autoComplete="off"
          className="searchable-select-input spares-field"
          onFocus={() => {
            setOpen(true);
            setQuery(selected?.label ?? "");
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            }
            if (event.key === "Enter" && open && filtered[activeIndex]) {
              event.preventDefault();
              choose(filtered[activeIndex].value);
            }
            if (event.key === "Escape") {
              setOpen(false);
              setQuery(selected?.label ?? "");
            }
          }}
        />
        {open && filtered.length > 0 ? (
          <ul id={listId} role="listbox" className="searchable-select-list">
            {filtered.map((row, index) => (
              <li key={row.value || "__empty"} role="presentation">
                <button
                  id={`${id}-option-${row.value || "empty"}`}
                  type="button"
                  role="option"
                  aria-selected={row.value === value}
                  className={`searchable-select-option${
                    row.value === CREATE_VALUE ? " searchable-select-option-create" : ""
                  }${index === activeIndex ? " searchable-select-option-active" : ""}${
                    row.value === value ? " searchable-select-option-selected" : ""
                  }`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(row.value)}
                >
                  {row.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {open && filtered.length === 0 ? (
          <p className="searchable-select-empty" role="status">
            No matches
          </p>
        ) : null}
      </div>
    </div>
  );
}
