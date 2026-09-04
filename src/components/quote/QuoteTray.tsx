"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { createQuote } from "@/lib/api/quotes";
import { errorMessage } from "@/lib/api/errors";
import type { Part } from "@/lib/api/types";
import { quoteHref } from "@/lib/quotes";

export type TrayLine = {
  part: Part;
  qty: number;
};

type Sheet = "peek" | "full" | "out";

const DESKTOP_STAGE = "(min-width: 1024px) and (min-height: 840px)";

function isDesktopStage() {
  return (
    typeof window !== "undefined" && window.matchMedia(DESKTOP_STAGE).matches
  );
}

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
  sentHref,
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
  sentHref?: string;
  onClose?: () => void;
}) {
  return (
    <div className="quote-sheet-form flex min-h-0 flex-1 flex-col px-5 pb-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] leading-tight font-semibold tracking-tight text-neutral-950">
            Quote
          </h2>
          <p className="spares-muted mt-0.5 text-sm">
            {lines.length === 0
              ? "Add a part to get started."
              : `${lines.length} ${lines.length === 1 ? "part" : "parts"}`}
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[#0b0d10]"
            aria-label="Hide quote"
            onClick={onClose}
          >
            <span className="text-2xl leading-none">×</span>
          </button>
        ) : null}
      </div>
      <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden">
        {lines.map((line) => (
          <li key={line.part.id} className="tray-line rounded-[18px] bg-[#f4f5f7] px-3 py-3">
            <p className="truncate text-[15px] font-medium text-neutral-950">{line.part.name}</p>
            <p className="spares-muted truncate font-mono text-xs">{line.part.id}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" aria-label={`Decrease ${line.part.name}`} disabled={line.qty <= 1} onClick={() => onQty(line.part.id, Math.max(1, line.qty - 1))} className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl font-medium text-[#0b0d10] disabled:opacity-30">−</button>
              <span className="min-w-8 text-center text-[17px] tabular-nums text-neutral-950">{line.qty}</span>
              <button type="button" aria-label={`Increase ${line.part.name}`} onClick={() => onQty(line.part.id, line.qty + 1)} className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl font-medium text-[#0b0d10]">+</button>
              <button type="button" onClick={() => onRemove(line.part.id)} className="spares-muted ml-auto inline-flex h-11 items-center rounded-full px-3 text-sm font-medium">Remove</button>
            </div>
          </li>
        ))}
      </ul>
      <label className="mt-3 block text-sm font-medium text-neutral-700">
        Note
        <textarea rows={2} value={note} onChange={(event) => onNote(event.target.value)} className="mt-1.5 w-full resize-none rounded-2xl border-0 bg-[#f4f5f7] px-3 py-2.5 text-[16px] outline-none" placeholder="Optional — site, serial, need-by…" />
      </label>
      {error ? <p className="mt-2 text-sm text-red-600" role="alert">{error}</p> : null}
      {sent ? (
        <p className="mt-2 text-sm text-neutral-500" role="status">
          Quote sent.{sentHref ? <>{" "}<Link href={sentHref} className="font-medium text-[#0a84ff]">View quote</Link></> : null}
        </p>
      ) : null}
      <button type="button" disabled={submitting || lines.length === 0} onClick={onSubmit} className="btn-accent mt-3 inline-flex h-12 w-full items-center justify-center rounded-full text-[17px] font-semibold disabled:opacity-30">
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
  const [sentHref, setSentHref] = useState<string | undefined>();
  const [sheet, setSheet] = useState<Sheet>(open ? "full" : "out");
  const [dragging, setDragging] = useState(false);
  const [dragPx, setDragPx] = useState(0);
  const card = useRef<HTMLElement>(null);
  const drag = useRef({ y: 0, on: false, pending: false, from: "peek" as Sheet, t: 0 });
  const closeTimer = useRef(0);
  const count = lines.reduce((sum, line) => sum + line.qty, 0);

  function setOpen(next: boolean) {
    onOpenChange?.(next);
  }

  useEffect(() => {
    window.clearTimeout(closeTimer.current);
    if (open) {
      setSheet("full");
      setDragPx(0);
      setDragging(false);
      return;
    }
    setSheet("out");
    setDragPx(0);
    setDragging(false);
  }, [open]);

  const prevCount = useRef(count);
  useEffect(() => {
    if (open && count > prevCount.current) {
      setSheet("full");
    }
    prevCount.current = count;
  }, [count, open]);

  async function handleSubmit() {
    setError(null);
    setSent(false);
    if (lines.length === 0) {
      setError("Add a part to the quote first.");
      return;
    }
    setSubmitting(true);
    try {
      const created = await createQuote({
        machineId,
        items: lines.map((line) => ({ id: line.part.id, name: line.part.name, qty: line.qty })),
        note: note.trim() || undefined,
      });
      setSent(true);
      setSentHref(quoteHref("customer", created));
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
    onSubmit: () => { void handleSubmit(); },
    submitting,
    error,
    sent,
    sentHref,
  };

  function hide() {
    if (sheet === "full" && !isDesktopStage()) {
      setSheet("peek");
      setOpen(true);
      return;
    }
    setSheet("out");
    setOpen(false);
  }

  function onCardPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (isDesktopStage()) return;
    if ((event.target as HTMLElement).closest("button, a, input, textarea")) return;
    const fromHandle = !!(event.target as HTMLElement).closest(".quote-sheet-handle");
    if (sheet === "full" && !fromHandle) {
      drag.current = { y: event.clientY, on: false, pending: true, from: "full", t: performance.now() };
      return;
    }
    drag.current = { y: event.clientY, on: true, pending: false, from: sheet === "full" ? "full" : "peek", t: performance.now() };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onCardPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (drag.current.pending && drag.current.from === "full") {
      const dy = event.clientY - drag.current.y;
      const body = card.current?.querySelector(".quote-sheet-form");
      const atTop = body instanceof HTMLElement ? body.scrollTop <= 1 : true;
      if (dy > 10 && atTop) {
        drag.current.on = true;
        drag.current.pending = false;
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      } else if (Math.abs(dy) > 10) {
        drag.current.pending = false;
        return;
      } else {
        return;
      }
    }
    if (!drag.current.on) return;
    const dy = event.clientY - drag.current.y;
    setDragPx(drag.current.from === "full" && dy < 0 ? dy * 0.22 : dy);
  }

  function settleSheet(dy: number, from: Sheet, dt: number) {
    drag.current.on = false;
    drag.current.pending = false;
    setDragging(false);
    const velocity = dy / Math.max(dt, 1);
    if (from === "full") {
      if (dy > 90 || velocity > 0.6) {
        setSheet("peek");
        setOpen(true);
      } else {
        setSheet("full");
      }
    } else if (dy < -70 || velocity < -0.5) {
      setSheet("full");
      setOpen(true);
    } else if (dy > 90 || velocity > 0.55) {
      hide();
    } else {
      setSheet("peek");
      setOpen(true);
    }
    setDragPx(0);
  }

  function onCardPointerUp(event: ReactPointerEvent<HTMLElement>) {
    if (drag.current.pending) {
      drag.current.pending = false;
      drag.current.on = false;
      return;
    }
    if (!drag.current.on) return;
    const dy = event.clientY - drag.current.y;
    const dt = performance.now() - drag.current.t;
    if (drag.current.from !== "full" && Math.abs(dy) < 16 && dt < 340) {
      drag.current.on = false;
      setDragging(false);
      setDragPx(0);
      setSheet("full");
      setOpen(true);
      return;
    }
    settleSheet(dy, drag.current.from, dt);
  }

  if (fullscreen) {
    return (
      <button type="button" onClick={onExitToTray} className="viewer-chrome-chip inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold" aria-label={`Quote tray, ${count} ${count === 1 ? "item" : "items"}`}>
        Quote
        <span className="btn-accent inline-flex min-w-6 justify-center rounded-full px-2 py-0.5 text-xs tabular-nums">{count}</span>
      </button>
    );
  }

  return (
    <aside
      ref={card}
      data-quote-tray=""
      className={`quote-sheet${sheet === "full" ? " is-full" : ""}${sheet === "peek" ? " is-peek" : ""}${sheet === "out" ? " is-out" : ""}${dragging ? " is-dragging" : ""}`}
      style={{ ["--drag" as string]: `${dragPx}px` }}
      onPointerDown={onCardPointerDown}
      onPointerMove={onCardPointerMove}
      onPointerUp={onCardPointerUp}
      onPointerCancel={onCardPointerUp}
    >
      <button
        type="button"
        className="quote-sheet-handle"
        aria-label={sheet === "full" ? "Hide quote" : "Show quote"}
        onClick={() => {
          if (isDesktopStage()) {
            hide();
            return;
          }
          if (sheet === "full") setSheet("peek");
          else if (sheet === "peek") {
            setSheet("full");
            setOpen(true);
          }
        }}
      />
      <QuoteTrayForm {...formProps} onClose={hide} />
    </aside>
  );
}
