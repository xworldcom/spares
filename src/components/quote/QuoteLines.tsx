"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  formatMoney,
  hasSellPrice,
  lineSellTotal,
  parseStaffMoneyField,
  quoteSellTotal,
} from "@/lib/quotes";
import {
  qtyDraftIsComplete,
  qtyKeyReplacesDraft,
  sanitizeQtyDraft,
  validateEditableQty,
} from "@/lib/ui/editable-qty";
import { PartLifecycleNotice } from "@/components/part-lifecycle/PartLifecycleNotice";
import { StaffQuoteLineLifecycle } from "@/components/quote/StaffQuoteLineLifecycle";
import type { QuoteItem, Role } from "@/types";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="spares-muted block text-xs font-medium">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputClass =
  "spares-field h-11 w-full min-w-0 rounded-2xl border-0 px-3 text-[16px] outline-none";

function selectQtyInput(input: HTMLInputElement) {
  input.select();
  try {
    input.setSelectionRange(0, input.value.length);
  } catch {
    // Some browsers reject setSelectionRange on certain input types.
  }
}

function StaffMoneyInput({
  label,
  value,
  inputId,
  error,
  onError,
  onCommit,
  onPreview,
}: {
  label: string;
  value?: number;
  inputId: string;
  error?: string;
  onError: (message: string | null) => void;
  onCommit: (value?: number) => void;
  onPreview?: (value: number | undefined | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  function commit(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed && value !== undefined) {
      setDraft(null);
      onError(null);
      return;
    }
    const parsed = parseStaffMoneyField(raw);
    if (!parsed.ok) {
      onError(parsed.error);
      setDraft(null);
      return;
    }
    onError(null);
    onCommit(parsed.value);
    onPreview?.(null);
    setDraft(null);
  }

  return (
    <Field label={label}>
      <input
        id={inputId}
        type="text"
        inputMode="decimal"
        value={draft ?? (value !== undefined ? value.toFixed(2) : "")}
        onFocus={() => {
          setDraft(value !== undefined ? value.toFixed(2) : "");
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          if (!event.target.value.trim()) {
            onError(null);
            onPreview?.(undefined);
            return;
          }
          const parsed = parseStaffMoneyField(event.target.value);
          if (!parsed.ok) {
            onError(parsed.error);
            onPreview?.(null);
          } else {
            onError(null);
            onPreview?.(parsed.value);
          }
        }}
        onBlur={() => commit(draft ?? (value !== undefined ? value.toFixed(2) : ""))}
        className={inputClass}
        placeholder="0.00"
        aria-invalid={error ? true : undefined}
      />
      {error ? (
        <p className="mt-1 text-xs text-[#f0c4c0]" role="alert">{error}</p>
      ) : null}
    </Field>
  );
}

function QtyField({
  value,
  onCommit,
  onPreview,
}: {
  value: number;
  onCommit: (qty: number) => void;
  onPreview?: (qty: number | null) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const replaceOnType = useRef(true);

  function commit(raw: string) {
    const validated = validateEditableQty(raw);
    if (!validated.ok) {
      setError(validated.error);
      setDraft(null);
      replaceOnType.current = true;
      return;
    }
    setError(null);
    onCommit(validated.qty);
    onPreview?.(null);
    setDraft(null);
    replaceOnType.current = true;
  }

  return (
    <div>
      <label htmlFor={id} className="spares-muted block text-xs font-medium">
        Qty
      </label>
      <div className="mt-1">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="done"
          aria-label="Qty"
          value={draft ?? String(value)}
          onFocus={(event) => {
            const input = event.currentTarget;
            setError(null);
            setDraft(String(value));
            replaceOnType.current = true;
            requestAnimationFrame(() => selectQtyInput(input));
            window.setTimeout(() => selectQtyInput(input), 0);
            window.setTimeout(() => selectQtyInput(input), 50);
          }}
          onPointerUp={(event) => {
            event.preventDefault();
            selectQtyInput(event.currentTarget);
          }}
          onMouseUp={(event) => {
            event.preventDefault();
            selectQtyInput(event.currentTarget);
          }}
          onChange={(event) => {
            const next = sanitizeQtyDraft(event.target.value);
            setDraft(next);
            replaceOnType.current = false;
            if (!next.trim()) {
              setError(null);
              onPreview?.(null);
              return;
            }
            const validated = validateEditableQty(next);
            if (validated.ok) {
              setError(null);
              onPreview?.(validated.qty);
            } else {
              setError(validated.error);
              onPreview?.(null);
            }
          }}
          onBlur={() => {
            const raw = draft ?? String(value);
            const validated = validateEditableQty(raw);
            if (!validated.ok) {
              setError(validated.error);
              setDraft(null);
              onPreview?.(null);
              return;
            }
            commit(raw);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
              return;
            }
            if (qtyKeyReplacesDraft(replaceOnType.current, event.key)) {
              event.preventDefault();
              replaceOnType.current = false;
              setDraft(event.key);
              return;
            }
            if (
              event.key.length === 1 ||
              event.key === "Backspace" ||
              event.key === "Delete"
            ) {
              replaceOnType.current = false;
            }
          }}
          className={inputClass}
          aria-invalid={error ? true : undefined}
        />
        {error ? (
          <p className="mt-1 text-xs text-[#f0c4c0]" role="alert">{error}</p>
        ) : null}
      </div>
    </div>
  );
}

export function QuoteLines({
  items,
  role,
  pricesVisible,
  editable,
  pricingEditable = editable,
  onChange,
  onPricingPreviewChange,
}: {
  items: QuoteItem[];
  role: Role;
  pricesVisible: boolean;
  editable: boolean;
  pricingEditable?: boolean;
  onChange?: (items: QuoteItem[]) => void;
  onPricingPreviewChange?: (active: boolean) => void;
}) {
  const [moneyErrors, setMoneyErrors] = useState<Record<string, string>>({});
  const [previewByLine, setPreviewByLine] = useState<
    Record<string, Partial<Pick<QuoteItem, "qty" | "sellPrice" | "supplierCost">>>
  >({});

  useEffect(() => {
    onPricingPreviewChange?.(Object.keys(previewByLine).length > 0);
  }, [onPricingPreviewChange, previewByLine]);

  function setLinePreviewField(
    lineId: string,
    field: "qty" | "sellPrice" | "supplierCost",
    value: number | undefined | null,
  ) {
    setPreviewByLine((current) => {
      const row = { ...(current[lineId] ?? {}) };
      if (value === null || value === undefined) {
        delete row[field];
      } else {
        row[field] = value;
      }
      if (Object.keys(row).length === 0) {
        if (!(lineId in current)) {
          return current;
        }
        const next = { ...current };
        delete next[lineId];
        return next;
      }
      return { ...current, [lineId]: row };
    });
  }

  function patch(index: number, update: Partial<QuoteItem>) {
    onChange?.(
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...update } : item,
      ),
    );
  }

  const resolvedItems = items.map((item) => ({
    ...item,
    ...previewByLine[item.id],
  }));
  const total = quoteSellTotal(resolvedItems);

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const resolved = resolvedItems[index] ?? item;
        const line = lineSellTotal(resolved);
        return (
          <article
            key={item.id}
            className="spares-surface rounded-[22px] px-4 py-4"
          >
            {item.name && item.name !== item.id ? (
              <>
                <p className="text-[17px] font-medium tracking-tight">{item.name}</p>
                <p className="spares-muted mt-0.5 text-xs">
                  <span className="font-medium text-[var(--spares-ink)]">Part no.</span>{" "}
                  <span className="font-mono">{item.id}</span>
                </p>
              </>
            ) : (
              <p className="text-[17px] font-medium tracking-tight">
                {item.name?.trim() || item.id}
              </p>
            )}
            {item.note ? (
              <p className="spares-muted mt-1 text-sm leading-snug">{item.note}</p>
            ) : null}
            {editable && role === "staff" ? (
              <StaffQuoteLineLifecycle
                partNumber={item.id}
                lifecycle={item.lifecycle}
                onSaved={(next) => patch(index, { lifecycle: next })}
              />
            ) : (
              <PartLifecycleNotice lifecycle={item.lifecycle} compact />
            )}

            {editable ? (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <QtyField
                  value={item.qty}
                  onCommit={(qty) => {
                    setLinePreviewField(item.id, "qty", null);
                    patch(index, { qty });
                  }}
                  onPreview={(qty) => setLinePreviewField(item.id, "qty", qty)}
                />
                {pricingEditable ? (
                  <>
                <StaffMoneyInput
                  label="Supplier cost"
                  inputId={`cost-${item.id}`}
                  value={item.supplierCost}
                  error={moneyErrors[`cost-${item.id}`]}
                  onError={(message) => {
                    const key = `cost-${item.id}`;
                    setMoneyErrors((prev) => {
                      const next = { ...prev };
                      if (message) {
                        next[key] = message;
                      } else {
                        delete next[key];
                      }
                      return next;
                    });
                  }}
                  onCommit={(nextValue) => {
                    setLinePreviewField(item.id, "supplierCost", null);
                    patch(index, { supplierCost: nextValue });
                  }}
                  onPreview={(nextValue) =>
                    setLinePreviewField(item.id, "supplierCost", nextValue)
                  }
                />
                <div>
                  <StaffMoneyInput
                    label="Sell price"
                    inputId={`sell-${item.id}`}
                    value={item.sellPrice}
                    error={moneyErrors[`sell-${item.id}`]}
                    onError={(message) => {
                      const key = `sell-${item.id}`;
                      setMoneyErrors((prev) => {
                        const next = { ...prev };
                        if (message) {
                          next[key] = message;
                        } else {
                          delete next[key];
                        }
                        return next;
                      });
                    }}
                    onCommit={(nextValue) => {
                      setLinePreviewField(item.id, "sellPrice", null);
                      patch(index, { sellPrice: nextValue });
                    }}
                    onPreview={(nextValue) =>
                      setLinePreviewField(item.id, "sellPrice", nextValue)
                    }
                  />
                  {!hasSellPrice(item) ? (
                    <p
                      id={`sell-hint-${item.id}`}
                      className="mt-1 text-xs text-[#e8c27a]"
                      role="status"
                    >
                      Enter a sell price above zero before quoting.
                    </p>
                  ) : null}
                </div>
                <Field label="Lead time (days)">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={item.leadTimeDays ?? ""}
                    onChange={(event) =>
                      patch(index, {
                        leadTimeDays: event.target.value
                          ? Number(event.target.value)
                          : undefined,
                      })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Supplier">
                  <input
                    type="text"
                    value={item.supplier ?? ""}
                    onChange={(event) =>
                      patch(index, { supplier: event.target.value || undefined })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Note">
                  <input
                    type="text"
                    value={item.note ?? ""}
                    onChange={(event) =>
                      patch(index, { note: event.target.value || undefined })
                    }
                    className={inputClass}
                  />
                </Field>
                  </>
                ) : (
                  <p className="col-span-2 text-sm text-[#e8c27a] sm:col-span-3">
                    Pricing is locked after PO received.
                  </p>
                )}
              </div>
            ) : (
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="spares-muted text-xs">Qty</dt>
                  <dd className="tabular-nums">{item.qty}</dd>
                </div>
                {item.vendor || item.material || item.replaces || item.stock ? (
                  <div className="col-span-2 sm:col-span-4">
                    <dt className="spares-muted text-xs">Details</dt>
                    <dd>
                      {[
                        item.vendor,
                        item.material,
                        item.stock ? `stock ${item.stock}` : "",
                        item.replaces ? `replaces ${item.replaces}` : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </dd>
                  </div>
                ) : null}
                {pricesVisible ? (
                  <>
                    <div>
                      <dt className="spares-muted text-xs">Sell</dt>
                      <dd className="tabular-nums">
                        {hasSellPrice(item) ? formatMoney(item.sellPrice!) : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="spares-muted text-xs">Lead time</dt>
                      <dd>
                        {item.leadTimeDays !== undefined
                          ? `${item.leadTimeDays}d`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="spares-muted text-xs">Line</dt>
                      <dd className="tabular-nums">
                        {line !== undefined ? formatMoney(line) : "—"}
                      </dd>
                    </div>
                  </>
                ) : (
                  <div className="col-span-1 sm:col-span-3">
                    <dt className="spares-muted text-xs">Price</dt>
                    <dd>Shown after quoted</dd>
                  </div>
                )}
                {role === "staff" ? (
                  <>
                    <div>
                      <dt className="spares-muted text-xs">Cost</dt>
                      <dd className="tabular-nums">
                        {item.supplierCost !== undefined
                          ? formatMoney(item.supplierCost)
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="spares-muted text-xs">Supplier</dt>
                      <dd>{item.supplier ?? "—"}</dd>
                    </div>
                  </>
                ) : null}
              </dl>
            )}
          </article>
        );
      })}
      {pricesVisible && total !== undefined ? (
        <p className="px-1 text-right text-[17px] font-semibold tabular-nums">
          Total {formatMoney(total)}
        </p>
      ) : null}
    </div>
  );
}
