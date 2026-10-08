"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import { DESKTOP_STAGE } from "@/components/machine/useDesktopStage";
import { useQuoteAlerts } from "@/components/quote/QuoteAlerts";
import { createQuote } from "@/lib/api/quotes";
import { errorMessage } from "@/lib/api/errors";
import type { Part } from "@/lib/api/types";
import { navigateToQuoteDetail } from "@/lib/nav/quote-request-nav";
import {
  afterNextPaint,
  bounceQuoteCount,
} from "@/lib/ui/quote-feedback";
import {
  initialQuoteSheetSnap,
  type QuoteSheetSnap,
} from "@/lib/ui/quote-sheet";
import { ManualQuoteLines } from "@/components/quote/ManualQuoteLines";
import { PartLifecycleNotice } from "@/components/part-lifecycle/PartLifecycleNotice";
import { trayCountLabel } from "@/lib/ui/tray-count-label";

export type TrayLine = {
  part: Part;
  qty: number;
  thumb?: string;
};

type Sheet = QuoteSheetSnap;

export const SHEET_EASE_MS = 420;
const DRAG_SLOP = 8;
const SAMPLE_WINDOW_MS = 90;

function isDesktopStage() {
  return (
    typeof window !== "undefined" && window.matchMedia(DESKTOP_STAGE).matches
  );
}

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
  onAdd,
  allowManual,
  onSubmit,
  submitting,
  error,
  onClose,
}: {
  lines: TrayLine[];
  note: string;
  onNote: (value: string) => void;
  onQty: (partId: string, qty: number) => void;
  onRemove: (partId: string) => void;
  onAdd?: (part: Part, qty: number) => void;
  allowManual?: boolean;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  onClose?: () => void;
}) {
  const unitCount = lines.reduce((sum, line) => sum + line.qty, 0);
  const countLabel = trayCountLabel(lines.length, unitCount);
  return (
    <div className="quote-sheet-form flex min-h-0 flex-1 flex-col px-5 pb-5">
      <div className="quote-sheet-grab flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[22px] leading-tight font-semibold tracking-tight">
            Quote
          </h2>
          <p className="spares-muted mt-0.5 truncate text-sm">
            <span data-quote-target="count" className="quote-count">
              {lines.length === 0 ? (
                allowManual ? "Add a part number to quote." : "Tap a part on the machine."
              ) : (
                <span key={countLabel} className="quote-count-num">
                  {countLabel}
                </span>
              )}
            </span>
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            data-no-drag=""
            className="inline-flex h-11 w-11 items-center justify-center rounded-full"
            aria-label="Hide quote"
            onClick={onClose}
          >
            <span className="text-2xl leading-none">×</span>
          </button>
        ) : null}
      </div>

      <div className="quote-sheet-body mt-4 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
            {lines.length === 0 && !allowManual ? (
              <div className="quote-sheet-empty mt-4">
                <p className="max-w-[16rem] text-[15px] leading-relaxed text-[var(--spares-muted)]">
                  Select a part, then add it.
                </p>
              </div>
            ) : null}

            {!allowManual && lines.length > 0 ? (
              <ul className="space-y-2">
                {lines.map((line) => (
                  <li
                    key={line.part.id}
                    className="tray-line spares-field rounded-[18px] px-3 py-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-[var(--spares-stage)]">
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
                        <p className="line-clamp-2 text-[15px] font-medium leading-snug">
                          {line.part.name}
                        </p>
                        <p className="spares-muted truncate font-mono text-xs">
                          {line.part.id}
                        </p>
                        <p className="spares-muted mt-0.5 truncate text-[12px]">
                          {line.part.meshName}
                          {line.part.qty > 1 ? ` · BOM qty ${line.part.qty}` : ""}
                        </p>
                        <PartLifecycleNotice lifecycle={line.part.lifecycle} compact />
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        aria-label={`Decrease ${line.part.name}`}
                        disabled={line.qty <= 1}
                        onClick={() =>
                          onQty(line.part.id, Math.max(1, line.qty - 1))
                        }
                        className="spares-surface inline-flex h-11 w-11 items-center justify-center rounded-full text-xl font-medium disabled:opacity-30"
                      >
                        −
                      </button>
                      <span className="min-w-8 text-center text-[17px] tabular-nums">
                        {line.qty}
                      </span>
                      <button
                        type="button"
                        aria-label={`Increase ${line.part.name}`}
                        onClick={() => onQty(line.part.id, line.qty + 1)}
                        className="spares-surface inline-flex h-11 w-11 items-center justify-center rounded-full text-xl font-medium"
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
            ) : null}

            {allowManual && onAdd ? (
              <ManualQuoteLines
                lines={lines.map((line) => ({
                  id: line.part.id,
                  name: line.part.name,
                  qty: line.qty,
                }))}
                onAdd={(line) =>
                  onAdd(
                    {
                      id: line.id,
                      name: line.name,
                      meshName: "",
                      qty: line.qty,
                    },
                    line.qty,
                  )
                }
                onQty={onQty}
                onRemove={onRemove}
              />
            ) : null}

            {lines.length > 0 ? (
              <label className="mt-3 block text-sm font-medium text-[var(--spares-muted)]">
                Note
                <textarea
                  rows={2}
                  value={note}
                  onChange={(event) => onNote(event.target.value)}
                  className="spares-field mt-1.5 w-full resize-none rounded-2xl border-0 px-3 py-2.5 text-[16px] outline-none"
                  placeholder="Optional — site, serial, need-by…"
                />
              </label>
            ) : null}
          </div>

          {lines.length > 0 ? (
            <div className="quote-sheet-actions shrink-0 pt-3">
              {error ? (
                <p
                  className="spares-alert mb-2 rounded-2xl px-3 py-2 text-sm"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
              <button
                type="button"
                disabled={submitting}
                onClick={onSubmit}
                className="btn-accent inline-flex h-12 w-full items-center justify-center rounded-full text-[16px] font-semibold disabled:opacity-30"
              >
                {submitting ? "Sending…" : "Request quote"}
              </button>
            </div>
          ) : null}
    </div>
  );
}

export function QuoteTray({
  machineId,
  lines,
  onQty,
  onRemove,
  onAdd,
  allowManual = false,
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
  onAdd?: (part: Part, qty: number) => void;
  allowManual?: boolean;
  onClear: () => void;
  fullscreen?: boolean;
  onExitToTray?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refresh: refreshQuoteAlerts } = useQuoteAlerts();
  const [sheet, setSheet] = useState<Sheet>(() =>
    initialQuoteSheetSnap(open, isDesktopStage()),
  );
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

  const unitCount = lines.reduce((sum, line) => sum + line.qty, 0);
  const prevCount = useRef(unitCount);

  useEffect(() => {
    const increased = unitCount > prevCount.current;
    prevCount.current = unitCount;
    if (!increased) {
      return;
    }
    const node = card.current?.querySelector<HTMLElement>(
      '[data-quote-target="count"]',
    );
    if (!node) {
      return;
    }
    afterNextPaint(() => {
      bounceQuoteCount(node);
    });
  }, [unitCount]);

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
        return initialQuoteSheetSnap(true, isDesktopStage());
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

  async function handleSubmit() {
    setError(null);
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
      setNote("");
      onClear();
      setSheet("full");
      setOpen(true);
      void refreshQuoteAlerts();
      afterNextPaint(() => {
        navigateToQuoteDetail(router, "customer", created);
      });
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
    onAdd,
    allowManual,
    onSubmit: () => {
      void handleSubmit();
    },
    submitting,
    error,
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
      const body = card.current?.querySelector(".quote-sheet-body");
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
        aria-label={`Quote tray, ${trayCountLabel(lines.length, unitCount)}`}
      >
        Quote
        <span
          data-quote-target="badge"
          className="btn-accent inline-flex min-w-6 justify-center rounded-full px-2 py-0.5 text-xs tabular-nums"
        >
          {unitCount}
        </span>
      </button>
    );
  }

  return (
    <aside
      ref={card}
      data-quote-tray=""
      className={`quote-sheet${
        sheet !== "out" ? " quote-timeline-handoff-source" : ""
      }${sheet === "full" ? " is-full" : ""}${
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
        data-quote-target="handle"
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
