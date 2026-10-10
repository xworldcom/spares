import type { QuoteSheetSnap } from "@/lib/ui/quote-sheet";
import { initialQuoteSheetSnap } from "@/lib/ui/quote-sheet";

/**
 * Kevin B1: post-Add tray open is intentional confirmation feedback.
 * Never auto-open from hydration or page load — only explicit add or Quote chip.
 */
export function quoteTraySnapWhenOpening(
  open: boolean,
  desktopStage: boolean,
): QuoteSheetSnap {
  return initialQuoteSheetSnap(open, desktopStage);
}

/** After each add on phone/tablet, settle at peek so the stage/list stay visible. */
export function quoteTraySnapAfterLineAdded(desktopStage: boolean): QuoteSheetSnap {
  return desktopStage ? "full" : "peek";
}

/** Dismiss the part chip after add so the tray peek does not cover the next pick target. */
export function dismissPartSheetAfterQuoteAdd(): boolean {
  return true;
}
