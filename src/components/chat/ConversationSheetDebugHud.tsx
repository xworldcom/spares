"use client";

import { useEffect, useState } from "react";
import {
  conversationSheetDebugEnabled,
  readConversationSheetDebugSnapshot,
  type ConversationSheetDebugSnapshot,
} from "@/lib/ui/conversation-sheet-debug";

function row(label: string, value: string | number | boolean | null) {
  return (
    <div className="flex gap-2">
      <span className="w-[7.5rem] shrink-0 text-white/55">{label}</span>
      <span className="min-w-0 break-all text-emerald-300">{String(value)}</span>
    </div>
  );
}

export function ConversationSheetDebugHud({
  cardRef,
  sheet,
  displaySnap,
  dragging,
  motionPhaseA,
  motionPhaseB,
}: {
  cardRef: React.RefObject<HTMLElement | null>;
  sheet: string;
  displaySnap: string;
  dragging: boolean;
  motionPhaseA: number;
  motionPhaseB: number;
}) {
  const [on, setOn] = useState(false);
  const [snap, setSnap] = useState<ConversationSheetDebugSnapshot | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    setOn(conversationSheetDebugEnabled());
  }, []);

  useEffect(() => {
    if (!on) {
      return;
    }
    let frame = 0;
    let prev = "";
    const tick = () => {
      const next = readConversationSheetDebugSnapshot(cardRef.current, {
        sheet,
        displaySnap,
        dragging,
        motionPhaseA,
        motionPhaseB,
      });
      setSnap(next);
      const key = [
        next.sheet,
        next.displaySnap,
        next.dragging,
        next.layoutPeek,
        next.paintedH,
        next.classSnap,
        next.dataSnap,
      ].join("|");
      if (key !== prev) {
        prev = key;
        const line = `${Math.round(next.ts % 100000)} ${key}`;
        setHistory((h) => [...h.slice(-14), line]);
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [on, cardRef, sheet, displaySnap, dragging, motionPhaseA, motionPhaseB]);

  if (!on || !snap) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed top-14 right-2 z-[9999] w-[10.5rem] max-h-[9.5rem] overflow-hidden rounded-lg border border-white/15 bg-black/88 px-2 py-1.5 font-mono text-[10px] leading-snug text-white shadow-lg backdrop-blur-sm"
      aria-hidden
    >
      <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-amber-300/90">
        Sheet debug (?sheetDebug=1)
      </p>
      {row("sheet", snap.sheet)}
      {row("displaySnap", snap.displaySnap)}
      {row("data-snap", snap.dataSnap)}
      {row("classes", snap.classSnap || "—")}
      {row("dragging", snap.dragging)}
      {row("phaseA", snap.motionPhaseA.toFixed(2))}
      {row("phaseB", snap.motionPhaseB.toFixed(2))}
      {row("layoutPeek", snap.layoutPeek)}
      {row("--sheet-h", snap.paintedH ?? "css")}
      {row("box h", snap.boxH)}
      {row("computed h", snap.sheetHVar)}
      <div className="mt-1.5 border-t border-white/10 pt-1 text-[9px] text-white/45">
        {history.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
    </div>
  );
}
