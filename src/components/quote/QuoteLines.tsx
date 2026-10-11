"use client";

import { useId, useRef, useState } from "react";
import {
  formatMoney,
  hasSellPrice,
  lineSellTotal,
  parseStaffMoneyField,
  quoteSellTotal,
} from "@/lib/quotes";
import {
  parseEditableQty,
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

function QtyField({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (qty: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const replaceOnType = useRef(true);

  function commit(raw: string) {
    const validated = validateEditableQty(raw);
    if (!validated.ok) {
      setError(validated.error);
      onCommit(parseEditableQty(raw));
      setDraft(null);
      replaceOnType.current = true;
      return;
    }
    setError(null);
    onCommit(validated.qty);
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
            const validated = validateEditableQty(next);
            if (validated.ok) {
              setError(null);
              onCommit(validated.qty);
            } else {
              setError(validated.error);
            }
          }}
          onBlur={() => {
            commit(draft ?? String(value));
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
              onCommit(parseEditableQty(event.key));
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
}: {
  items: QuoteItem[];
  role: Role;
  pricesVisible: boolean;
  editable: boolean;
  pricingEditable?: boolean;
  onChange?: (items: QuoteItem[]) => void;
}) {
  const [moneyErrors, setMoneyErrors] = useState<Record<string, string>>({});

  function patch(index: number, update: Partial<QuoteItem>) {
    onChange?.(
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...update } : item,
      ),
    );
  }

  const total = quoteSellTotal(items);

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const line = lineSellTotal(item);
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
                  onCommit={(qty) => patch(index, { qty })}
                />
                {pricingEditable ? (
                  <>
                <Field label="Supplier cost">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={
                      item.supplierCost !== undefined
                        ? item.supplierCost.toFixed(2)
                        : ""
                    }
                    onChange={(event) => {
                      const parsed = parseStaffMoneyField(event.target.value);
                      const key = `cost-${item.id}`;
                      if (!parsed.ok) {
                        setMoneyErrors((prev) => ({ ...prev, [key]: parsed.error }));
                        return;
                      }
                      setMoneyErrors((prev) => {
                        const next = { ...prev };
                        delete next[key];
                        return next;
                      });
                      patch(index, { supplierCost: parsed.value });
                    }}
                    className={inputClass}
                    placeholder="0.00"
                    aria-invalid={moneyErrors[`cost-${item.id}`] ? true : undefined}
                  />
                  {moneyErrors[`cost-${item.id}`] ? (
                    <p className="mt-1 text-xs text-[#f0c4c0]" role="alert">
                      {moneyErrors[`cost-${item.id}`]}
                    </p>
                  ) : null}
                </Field>
                <Field label="Sell price">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={
                      item.sellPrice !== undefined ? item.sellPrice.toFixed(2) : ""
                    }
                    onChange={(event) => {
                      const parsed = parseStaffMoneyField(event.target.value);
                      const key = `sell-${item.id}`;
                      if (!parsed.ok) {
                        setMoneyErrors((prev) => ({ ...prev, [key]: parsed.error }));
                        return;
                      }
                      setMoneyErrors((prev) => {
                        const next = { ...prev };
                        delete next[key];
                        return next;
                      });
                      patch(index, { sellPrice: parsed.value });
                    }}
                    className={inputClass}
                    placeholder="0.00"
                    aria-invalid={!hasSellPrice(item) || moneyErrors[`sell-${item.id}`] ? true : undefined}
                    aria-describedby={
                      !hasSellPrice(item) ? `sell-hint-${item.id}` : undefined
                    }
                  />
                  {moneyErrors[`sell-${item.id}`] ? (
                    <p className="mt-1 text-xs text-[#f0c4c0]" role="alert">
                      {moneyErrors[`sell-${item.id}`]}
                    </p>
                  ) : null}
                  {!hasSellPrice(item) ? (
                    <p
                      id={`sell-hint-${item.id}`}
                      className="mt-1 text-xs text-[#e8c27a]"
                      role="status"
                    >
                      Enter a sell price above zero before quoting.
                    </p>
                  ) : null}
                </Field>
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
