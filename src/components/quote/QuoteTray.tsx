"use client";

import { useState } from "react";
import { createQuote } from "@/lib/api/quotes";
import { errorMessage } from "@/lib/api/errors";
import type { Part } from "@/lib/api/types";

export type TrayLine = {
  part: Part;
  qty: number;
};

function QuoteTrayForm({
  lines,
  note,
  onNote,
  onQty,
  onRemove,
  onSubmit,
  submitting,
  error,
  sent,
  onClose,
}: {
  lines: TrayLine[];
  note: string;
  onNote: (value: string) => void;
  onQty: (partId: string, qty: number) => void;
  onRemove: (partId: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  sent: boolean;
  onClose?: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] leading-tight font-semibold tracking-tight text-neutral-950">
            Quote
          </h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            {lines.length === 0
              ? "Add a part to get started."
              : `${lines.length} ${lines.length === 1 ? "part" : "parts"}`}
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-neutral-400"
            aria-label="Close quote"
            onClick={onClose}
          >
            <span className="text-2xl leading-none">×</span>
          </button>
        ) : null}
      </div>

      <ul className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
        {lines.map((line) => (
          <li
            key={line.part.id}
            className="tray-line rounded-[18px] bg-[#f4f5f7] px-3 py-3"
          >
            <p className="truncate text-[15px] font-medium text-neutral-950">
              {line.part.name}
            </p>
            <p className="truncate font-mono text-xs text-neutral-400">{line.part.id}</p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                aria-label={`Decrease ${line.part.name}`}
                disabled={line.qty <= 1}
                onClick={() => onQty(line.part.id, Math.max(1, line.qty - 1))}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl font-medium text-neutral-900 disabled:opacity-30"
              >
                −
              </button>
              <span className="min-w-8 text-center text-[17px] tabular-nums text-neutral-950">
                {line.qty}
              </span>
              <button
                type="button"
                aria-label={`Increase ${line.part.name}`}
                onClick={() => onQty(line.part.id, line.qty + 1)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl font-medium text-neutral-900"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => onRemove(line.part.id)}
                className="ml-auto inline-flex h-11 items-center rounded-full px-3 text-sm font-medium text-neutral-400"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      <label className="mt-4 block text-sm font-medium text-neutral-700">
        Note
        <textarea
          rows={2}
          value={note}
          onChange={(event) => onNote(event.target.value)}
          className="mt-1.5 w-full resize-none rounded-2xl border-0 bg-[#f4f5f7] px-3 py-2.5 text-sm outline-none"
          placeholder="Optional — site, serial, need-by…"
        />
      </label>

      {error ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {sent ? (
        <p className="mt-2 text-sm text-neutral-500" role="status">
          Quote sent.
        </p>
      ) : null}

      <button
        type="button"
        disabled={submitting || lines.length === 0}
        onClick={onSubmit}
        className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-full bg-[#0a84ff] text-[17px] font-semibold text-white disabled:opacity-30"
      >
        {submitting ? "Sending…" : "Request quote"}
      </button>
    </div>
  );
}

export function QuoteTray({
  machineId,
  lines,
  onQty,
  onRemove,
  onClear,
  fullscreen,
  onExitToTray,
  open = false,
  onOpenChange,
}: {
  machineId: string;
  lines: TrayLine[];
  onQty: (partId: string, qty: number) => void;
  onRemove: (partId: string) => void;
  onClear: () => void;
  fullscreen?: boolean;
  onExitToTray?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const count = lines.reduce((sum, line) => sum + line.qty, 0);

  function setOpen(next: boolean) {
    onOpenChange?.(next);
  }

  async function handleSubmit() {
    setError(null);
    setSent(false);
    if (lines.length === 0) {
      setError("Add a part to the quote first.");
      return;
    }
    setSubmitting(true);
    try {
      await createQuote({
        machineId,
        items: lines.map((line) => ({ id: line.part.id, qty: line.qty })),
        note: note.trim() || undefined,
      });
      setSent(true);
      setNote("");
      onClear();
      setOpen(false);
    } catch (cause) {
      setError(errorMessage(cause, "Could not request a quote."));
    } finally {
      setSubmitting(false);
    }
  }

  const formProps = {
    lines,
    note,
    onNote: setNote,
    onQty,
    onRemove,
    onSubmit: () => {
      void handleSubmit();
    },
    submitting,
    error,
    sent,
  };

  if (fullscreen) {
    return (
      <button
        type="button"
        onClick={onExitToTray}
        className="inline-flex h-11 items-center gap-2 rounded-full bg-white/92 px-4 text-sm font-semibold text-neutral-950 shadow-[0_8px_24px_rgba(0,0,0,0.18)] backdrop-blur-md"
        aria-label={`Quote tray, ${count} ${count === 1 ? "item" : "items"}`}
      >
        Quote
        <span className="inline-flex min-w-6 justify-center rounded-full bg-[#0a84ff] px-2 py-0.5 text-xs text-white tabular-nums">
          {count}
        </span>
      </button>
    );
  }

  return (
    <>
      <aside className="hidden h-full min-h-0 flex-col rounded-[28px] bg-white p-5 shadow-[0_16px_40px_rgba(15,18,22,0.06)] lg:flex">
        <QuoteTrayForm {...formProps} />
      </aside>

      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-16 w-full items-center justify-between rounded-[22px] bg-white px-5 shadow-[0_10px_30px_rgba(15,18,22,0.08)]"
        >
          <span className="text-[17px] font-semibold tracking-tight text-neutral-950">
            Quote
            <span className="ml-2 text-sm font-medium text-neutral-400">
              {count === 0 ? "" : count}
            </span>
          </span>
          <span className="text-sm font-medium text-neutral-400">Open</span>
        </button>

        {open ? (
          <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3">
            <div className="tray-sheet flex max-h-[min(48vh,28rem)] flex-col rounded-[28px] bg-white p-5 shadow-[0_20px_50px_rgba(0,0,0,0.18)]">
              <QuoteTrayForm {...formProps} onClose={() => setOpen(false)} />
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
