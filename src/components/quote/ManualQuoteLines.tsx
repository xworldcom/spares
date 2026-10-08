"use client";

import { useState } from "react";
import { MAX_QUOTE_ITEM_ID } from "@/lib/quotes";

export type ManualQuoteLine = {
  id: string;
  name: string;
  qty: number;
};

function lineId(partNumber: string, description: string) {
  return partNumber.trim() || description.trim();
}

export function ManualQuoteLines({
  lines,
  onAdd,
  onQty,
  onRemove,
}: {
  lines: ManualQuoteLine[];
  onAdd: (line: ManualQuoteLine) => void;
  onQty: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
}) {
  const [partNumber, setPartNumber] = useState("");
  const [description, setDescription] = useState("");
  const [qty, setQty] = useState("1");
  const [error, setError] = useState<string | null>(null);

  function addLine() {
    const id = lineId(partNumber, description);
    const name = description.trim() || partNumber.trim();
    const nextQty = Number.parseInt(qty, 10);
    if (!id || !name) {
      setError("Add a part number or description.");
      return;
    }
    if (id.length > MAX_QUOTE_ITEM_ID) {
      setError("Part number or description is too long.");
      return;
    }
    if (!Number.isInteger(nextQty) || nextQty < 1) {
      setError("Quantity must be at least 1.");
      return;
    }
    if (lines.some((line) => line.id === id)) {
      setError("That part is already on this quote.");
      return;
    }
    onAdd({ id, name, qty: nextQty });
    setPartNumber("");
    setDescription("");
    setQty("1");
    setError(null);
  }

  return (
    <div className="manual-quote-lines">
      {lines.length > 0 ? (
        <ul className="manual-quote-list">
          {lines.map((line) => (
            <li key={line.id} className="manual-quote-row">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium">{line.name}</p>
                <p className="spares-muted truncate font-mono text-xs">{line.id}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`Decrease ${line.name}`}
                  disabled={line.qty <= 1}
                  onClick={() => onQty(line.id, Math.max(1, line.qty - 1))}
                  className="spares-surface inline-flex h-11 w-11 items-center justify-center rounded-full text-xl font-medium disabled:opacity-30"
                >
                  −
                </button>
                <span className="min-w-8 text-center text-[17px] tabular-nums">
                  {line.qty}
                </span>
                <button
                  type="button"
                  aria-label={`Increase ${line.name}`}
                  onClick={() => onQty(line.id, line.qty + 1)}
                  className="spares-surface inline-flex h-11 w-11 items-center justify-center rounded-full text-xl font-medium"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(line.id)}
                  className="spares-muted inline-flex h-11 items-center rounded-full px-3 text-sm font-medium"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="manual-quote-add">
        <label className="care-field">
          <span>Part #</span>
          <input
            value={partNumber}
            onChange={(event) => setPartNumber(event.target.value)}
            className="spares-field manual-quote-part-number h-11 w-full rounded-2xl border-0 px-3 font-mono text-[16px] outline-none"
            maxLength={MAX_QUOTE_ITEM_ID}
            autoComplete="off"
            spellCheck={false}
            placeholder="A06B-0115"
          />
        </label>
        <label className="care-field manual-quote-desc">
          <span>Description</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="spares-field h-11 w-full rounded-2xl border-0 px-3 text-[16px] outline-none"
            maxLength={200}
            placeholder="Servo amplifier"
          />
        </label>
        <label className="care-field">
          <span>Qty</span>
          <input
            value={qty}
            inputMode="numeric"
            onChange={(event) => setQty(event.target.value)}
            className="spares-field h-11 w-full rounded-2xl border-0 px-3 text-[16px] outline-none"
          />
        </label>
        <button
          type="button"
          className="btn-soft inline-flex h-11 items-center justify-center rounded-full px-4 text-sm font-semibold"
          onClick={addLine}
        >
          Add part
        </button>
      </div>
      {error ? (
        <p className="text-sm text-[#f0c4c0]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
