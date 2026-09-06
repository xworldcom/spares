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
import { isDesktopStage } from "@/lib/ui/breakpoints";

export type TrayLine = {
  part: Part;
  qty: number;
  thumb?: string;
};

type Sheet = "peek" | "full" | "out";

export const SHEET_EASE_MS = 420;
const DRAG_SLOP = 8;
const SAMPLE_WINDOW_MS = 90;

function isSkipTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest(".quote-sheet-handle, .quote-sheet-grab")) {
    return false;
  }
  return Boolean(target.closest("button, a, input, textarea, select, label"));
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
      <div className="quote-sheet-grab flex items-center justify-between gap-3">
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
            data-no-drag=""
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
          <li
            key={line.part.id}
            className="tray-line rounded-[18px] bg-[#f4f5f7] px-3 py-3"
          >
            <div className="flex items-start gap-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-[#1c232c]">
                {line.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={line.thumb}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium tracking-wide text-white/45">
                    3D
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-neutral-950">
                  {line.part.name}
                </p>
                <p className="spares-muted truncate font-mono text-xs">{line.part.id}</p>
                <p className="spares-muted mt-0.5 truncate text-[12px]">
                  {line.part.meshName}
                  {line.part.qty > 1 ? ` · BOM qty ${line.part.qty}` : ""}
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-label={`Decrease ${line.part.name}`}
                disabled={line.qty <= 1}
                onClick={() => onQty(line.part.id, Math.max(1, line.qty - 1))}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl font-medium text-[#0b0d10] disabled:opacity-30"
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
                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl font-medium text-[#0b0d10]"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => onRemove(line.part.id)}
                className="spares-muted ml-auto inline-flex h-11 items-center rounded-full px-3 text-sm font-medium"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      <label className="mt-3 block text-sm font-medium text-neutral-700">
        Note
        <textarea
          rows={2}
          value={note}
          onChange={(event) => onNote(event.target.value)}
          className="mt-1.5 w-full resize-none rounded-2xl border-0 bg-[#f4f5f7] px-3 py-2.5 text-[16px] outline-none"
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
          {sentHref ? (
            <>
              {" "}
              <Link href={sentHref} className="font-medium text-[#0a84ff]">
                View quote
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      <button
        type="button"
        disabled={submitting || lines.length === 0}
        onClick={onSubmit}
        className="btn-accent mt-3 inline-flex h-12 w-full items-center justify-center rounded-full text-[17px] font-semibold disabled:opacity-30"
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
  const [sentHref, setSentHref] = useState<string | undefined>();
  const [sheet, setSheet] = useState<Sheet>(open ? "full" : "out");
  const [dragging, setDragging] = useState(false);
  const card = useRef<HTMLElement>(null);
  const drag = useRef({
    y: 0,
    on: false,
    pending: false,
    from: "peek" as Sheet,
    t: 0,
    moved: false,
    samples: [] as { t: number; y: number }[],
  });

  const count = lines.reduce((sum, line) => sum + line.qty, 0);

  function setOpen(next: boolean) {
    onOpenChange?.(next);
  }

  function paintDrag(px: number) {
    card.current?.style.setProperty("--drag", `${px}px`);
  }

  function setDraggingClass(on: boolean) {
    card.current?.classList.toggle("is-dragging", on);
  }

  useEffect(() => {
    if (open) {
      // Only lift a closed sheet. Peek must survive parent open=true
      // the same way Yonder keeps peek after a drag settle.
      setSheet((current) => {
        if (current !== "out") {
          return current;
        }
        return isDesktopStage() ? "full" : "peek";
      });
      paintDrag(0);
      setDragging(false);
      setDraggingClass(false);
      return;
    }
    setSheet("out");
    paintDrag(0);
    setDragging(false);
    setDraggingClass(false);
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
        items: lines.map((line) => ({
          id: line.part.id,
          name: line.part.name,
          qty: line.qty,
        })),
        note: note.trim() || undefined,
      });
      setSent(true);
      setSentHref(quoteHref("customer", created));
      setNote("");
      onClear();
      dismiss();
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
    sentHref,
  };

  function dismiss() {
    setSheet("out");
    paintDrag(0);
    setDragging(false);
    setDraggingClass(false);
    setOpen(false);
  }

  function hide() {
    if (sheet === "full" && !isDesktopStage()) {
      setSheet("peek");
      setOpen(true);
      return;
    }
    dismiss();
  }

  function beginDrag(event: ReactPointerEvent<HTMLElement>, from: Sheet, pending: boolean) {
    drag.current = {
      y: event.clientY,
      on: !pending,
      pending,
      from,
      t: performance.now(),
      moved: false,
      samples: [{ t: performance.now(), y: event.clientY }],
    };
    if (!pending) {
      setDragging(true);
      setDraggingClass(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function onCardPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (isDesktopStage()) {
      return;
    }
    if (event.button !== 0 && event.pointerType === "mouse") {
      return;
    }
    if (isSkipTarget(event.target)) {
      return;
    }
    const fromHandle = !!(event.target as HTMLElement).closest(
      ".quote-sheet-handle, .quote-sheet-grab",
    );
    if (sheet === "full" && !fromHandle) {
      beginDrag(event, "full", true);
      return;
    }
    beginDrag(event, sheet === "full" ? "full" : "peek", false);
  }

  function recordSample(y: number) {
    const now = performance.now();
    const samples = drag.current.samples;
    samples.push({ t: now, y });
    while (samples.length > 1 && now - samples[0].t > SAMPLE_WINDOW_MS) {
      samples.shift();
    }
  }

  function liveVelocity() {
    const samples = drag.current.samples;
    if (samples.length < 2) {
      return 0;
    }
    const first = samples[0];
    const last = samples[samples.length - 1];
    const dt = Math.max(last.t - first.t, 1);
    return (last.y - first.y) / dt;
  }

  function onCardPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (drag.current.pending && drag.current.from === "full") {
      const dy = event.clientY - drag.current.y;
      const body = card.current?.querySelector(".quote-sheet-form");
      const atTop = body instanceof HTMLElement ? body.scrollTop <= 1 : true;
      if (dy > DRAG_SLOP && atTop) {
        drag.current.on = true;
        drag.current.pending = false;
        drag.current.moved = true;
        setDragging(true);
        setDraggingClass(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      } else if (Math.abs(dy) > DRAG_SLOP) {
        drag.current.pending = false;
        return;
      } else {
        return;
      }
    }
    if (!drag.current.on) {
      return;
    }
    const dy = event.clientY - drag.current.y;
    if (Math.abs(dy) > DRAG_SLOP) {
      drag.current.moved = true;
    }
    const from = drag.current.from;
    const next =
      (from === "full" && dy < 0) || (from === "peek" && dy > 0)
        ? dy * 0.18
        : dy;
    recordSample(event.clientY);
    paintDrag(next);
  }

  function settleSheet(dy: number, from: Sheet) {
    drag.current.on = false;
    drag.current.pending = false;
    setDragging(false);
    setDraggingClass(false);
    paintDrag(0);
    const velocity = liveVelocity();
    if (from === "full") {
      if (dy > 48 || velocity > 0.35) {
        setSheet("peek");
        setOpen(true);
      } else {
        setSheet("full");
      }
      return;
    }
    if (dy < -36 || velocity < -0.35) {
      setSheet("full");
      setOpen(true);
      return;
    }
    setSheet("peek");
    setOpen(true);
  }

  function onCardPointerUp(event: ReactPointerEvent<HTMLElement>) {
    if (drag.current.pending) {
      drag.current.pending = false;
      drag.current.on = false;
      return;
    }
    if (!drag.current.on) {
      return;
    }
    const dy = event.clientY - drag.current.y;
    recordSample(event.clientY);
    if (!drag.current.moved && Math.abs(dy) < DRAG_SLOP) {
      drag.current.on = false;
      setDragging(false);
      setDraggingClass(false);
      paintDrag(0);
      if (drag.current.from !== "full") {
        setSheet("full");
        setOpen(true);
      }
      return;
    }
    settleSheet(dy, drag.current.from);
  }

  if (fullscreen) {
    return (
      <button
        type="button"
        onClick={onExitToTray}
        className="viewer-chrome-chip inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold"
        aria-label={`Quote tray, ${count} ${count === 1 ? "item" : "items"}`}
      >
        Quote
        <span className="btn-accent inline-flex min-w-6 justify-center rounded-full px-2 py-0.5 text-xs tabular-nums">
          {count}
        </span>
      </button>
    );
  }

  return (
    <aside
      ref={card}
      data-quote-tray=""
      className={`quote-sheet${sheet === "full" ? " is-full" : ""}${
        sheet === "peek" ? " is-peek" : ""
      }${sheet === "out" ? " is-out" : ""}${dragging ? " is-dragging" : ""}`}
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
          if (drag.current.moved) {
            return;
          }
          if (isDesktopStage()) {
            hide();
            return;
          }
          if (sheet === "full") {
            setSheet("peek");
          } else {
            setSheet("full");
            setOpen(true);
          }
        }}
      />
      <QuoteTrayForm {...formProps} onClose={hide} />
    </aside>
  );
}
