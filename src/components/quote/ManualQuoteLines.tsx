"use client";

import { useEffect, useId, useRef, useState } from "react";
import { PartLifecycleNotice } from "@/components/part-lifecycle/PartLifecycleNotice";
import { MAX_QUOTE_ITEM_ID } from "@/lib/quotes";
import {
  qtyKeyReplacesDraft,
  sanitizeQtyDraft,
  validateEditableQty,
} from "@/lib/ui/editable-qty";
import type { PartLifecycleInfo } from "@/types";

export type ManualQuoteLine = {
  id: string;
  name: string;
  qty: number;
  lifecycle?: PartLifecycleInfo;
};

function lineId(partNumber: string, description: string) {
  return partNumber.trim() || description.trim();
}

function TrayQtyInput({
  value,
  label,
  onCommit,
}: {
  value: number;
  label: string;
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
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        aria-label={label}
        aria-invalid={error ? true : undefined}
        value={draft ?? String(value)}
        onFocus={() => {
          setDraft(String(value));
          replaceOnType.current = true;
        }}
        onChange={(event) => {
          const next = sanitizeQtyDraft(event.target.value);
          setDraft(next);
          replaceOnType.current = false;
          if (!next.trim()) {
            setError(null);
            return;
          }
          const validated = validateEditableQty(next);
          setError(validated.ok ? null : validated.error);
        }}
        onBlur={() => commit(draft ?? String(value))}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
            return;
          }
          if (qtyKeyReplacesDraft(replaceOnType.current, event.key)) {
            event.preventDefault();
            replaceOnType.current = false;
            setDraft(event.key);
          }
        }}
        className="spares-field h-11 w-14 rounded-2xl border-0 px-2 text-center text-[16px] tabular-nums outline-none"
      />
      {error ? (
        <p className="mt-0.5 text-[10px] leading-tight text-[#f0c4c0]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ManualQuoteLines({
  lines,
  onAdd,
  onQty,
  onRemove,
  pickSeed,
}: {
  lines: ManualQuoteLine[];
  onAdd: (line: ManualQuoteLine) => void;
  onQty: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
  /** When the user picks a part in 3D, prefill the add row (not placeholder text). */
  pickSeed?: { id: string; name: string } | null;
}) {
  const [partNumber, setPartNumber] = useState("");
  const [description, setDescription] = useState("");
  const [qty, setQty] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const prevPickSeedId = useRef<string | null>(null);

  useEffect(() => {
    const seedId = pickSeed?.id ?? null;
    if (prevPickSeedId.current && !seedId) {
      setPartNumber("");
      setDescription("");
      setQty("1");
      setError(null);
    }
    prevPickSeedId.current = seedId;
    if (!seedId) {
      return;
    }
    if (lines.some((line) => line.id === seedId)) {
      setPartNumber("");
      setDescription("");
      setQty("1");
      setError(null);
      return;
    }
    setPartNumber(seedId);
    setDescription(pickSeed!.name.trim() || seedId);
    setQty("1");
    setError(null);
  }, [pickSeed?.id, pickSeed?.name, lines]);

  useEffect(() => {
    if (lines.length > 0) {
      return;
    }
    setPartNumber("");
    setDescription("");
    setQty("1");
    setError(null);
  }, [lines.length]);

  function addLine() {
    const id = lineId(partNumber, description);
    const name = description.trim() || partNumber.trim();
    if (!id || !name) {
      setError("Add a part number or description.");
      return;
    }
    if (id.length > MAX_QUOTE_ITEM_ID) {
      setError("Part number or description is too long.");
      return;
    }
    const qtyValidated = validateEditableQty(qty);
    if (!qtyValidated.ok) {
      setError(qtyValidated.error);
      return;
    }
    const nextQty = qtyValidated.qty;
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
              <div className="min-w-0 flex-[1_1_11rem]">
                <p
                  className="line-clamp-2 text-[15px] leading-snug font-medium"
                  title={line.name}
                  data-tray-line-name=""
                >
                  {line.name}
                </p>
                {line.name !== line.id ? (
                  <p className="spares-muted truncate font-mono text-xs" title={line.id}>
                    {line.id}
                  </p>
                ) : null}
                <PartLifecycleNotice lifecycle={line.lifecycle} compact />
              </div>
              <div className="flex items-center gap-2">
                <TrayQtyInput
                  value={line.qty}
                  label={`Quantity for ${line.name}`}
                  onCommit={(qty) => onQty(line.id, qty)}
                />
                <button
                  type="button"
                  onClick={() => onRemove(line.id)}
                  className="manual-quote-remove spares-muted inline-flex h-11 shrink-0 items-center rounded-full px-3 text-sm font-medium"
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
