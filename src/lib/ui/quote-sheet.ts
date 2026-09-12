export type QuoteSheetSnap = "peek" | "full" | "out";

/**
 * First snap when the quote tray mounts or opens from closed.
 * Phone/tablet stay at peek so the 3D stage stays visible.
 * Desktop side-dock uses the full column.
 */
export function initialQuoteSheetSnap(
  open: boolean,
  desktopStage: boolean,
): QuoteSheetSnap {
  if (!open) {
    return "out";
  }
  return desktopStage ? "full" : "peek";
}
