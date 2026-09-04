"use client";

import { useState } from "react";
import { formatMoney, lineSellTotal, quoteSellTotal } from "@/lib/quotes";
import {
  parseEditableQty,
  qtyDraftIsComplete,
  sanitizeQtyDraft,
} from "@/lib/ui/editable-qty";
import type { QuoteItem, Role } from "@/types";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs font-medium text-neutral-500">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputClass =
  "h-11 w-full min-w-0 rounded-2xl border-0 bg-[#f4f5f7] px-3 text-[16px] outline-none";

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
  const [draft, setDraft] = useState<string | null>(null);

  function commit(raw: string) {
    const next = parseEditableQty(raw);
    onCommit(next);
    setDraft(null);
  }

  return (
    <input
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
        requestAnimationFrame(() => selectQtyInput(input));
      }}
      onPointerUp={(event) => {
        event.preventDefault();
        selectQtyInput(event.currentTarget);
      }}
      onChange={(event) => {
        const next = sanitizeQtyDraft(event.target.value);
        setDraft(next);
        if (qtyDraftIsComplete(next)) {
          onCommit(parseEditableQty(next));
        }
      }}
      onBlur={() => {
        commit(draft ?? String(value));
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
      className={inputClass}
    />
  );
}

export function QuoteLines({
  items,
  role,
  pricesVisible,
  editable,
  onChange,
}: {
  items: QuoteItem[];
  role: Role;
  pricesVisible: boolean;
  editable: boolean;
  onChange?: (items: QuoteItem[]) => void;
}) {
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
            className="rounded-[22px] bg-white px-4 py-4"
          >
            <p className="text-[17px] font-medium tracking-tight">
              {item.name ?? "Part"}
            </p>
            {role === "staff" ? (
              <p className="spares-muted mt-0.5 font-mono text-xs">{item.id}</p>
            ) : null}

            {editable ? (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label="Qty">
                  <QtyField
                    value={item.qty}
                    onCommit={(qty) => patch(index, { qty })}
                  />
                </Field>
                <Field label="Supplier cost">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.supplierCost ?? ""}
                    onChange={(event) =>
                      patch(index, {
                        supplierCost: event.target.value
                          ? Number(event.target.value)
                          : undefined,
                      })
                    }
                    className={inputClass}
                    placeholder="0.00"
                  />
                </Field>
                <Field label="Sell price">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.sellPrice ?? ""}
                    onChange={(event) =>
                      patch(index, {
                        sellPrice: event.target.value
                          ? Number(event.target.value)
                          : undefined,
                      })
                    }
                    className={inputClass}
                    placeholder="0.00"
                  />
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
              </div>
            ) : (
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="spares-muted text-xs">Qty</dt>
                  <dd className="tabular-nums">{item.qty}</dd>
                </div>
                {pricesVisible ? (
                  <>
                    <div>
                      <dt className="spares-muted text-xs">Sell</dt>
                      <dd className="tabular-nums">
                        {item.sellPrice !== undefined
                          ? formatMoney(item.sellPrice)
                          : "—"}
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
