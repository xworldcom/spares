import { formatCalendarDay } from "./format-calendar-day.ts";
import type { PartLifecycleInfo } from "@/types";

/** Customer-facing status label for every lifecycle state (never blank). */
export function partLifecycleStatusLabel(status: PartLifecycleInfo["status"]) {
  if (status === "obsolete") {
    return "Discontinued";
  }
  if (status === "announced") {
    return "Discontinuation announced";
  }
  if (status === "active") {
    return "Active";
  }
  return "Unknown";
}

export function partLifecycleStatusHeadline(status: PartLifecycleInfo["status"]) {
  if (status === "obsolete" || status === "announced") {
    return partLifecycleStatusLabel(status);
  }
  return null;
}

export function partLifecycleDetailParts(lifecycle: PartLifecycleInfo): string[] {
  const details: string[] = [];
  if (lifecycle.discontinuationDate) {
    details.push(`Ends ${formatCalendarDay(lifecycle.discontinuationDate)}`);
  }
  if (lifecycle.lastTimeBuyDate) {
    details.push(`Last time buy ${formatCalendarDay(lifecycle.lastTimeBuyDate)}`);
  }
  if (lifecycle.successorPartNumber) {
    details.push(`Use ${lifecycle.successorPartNumber}`);
  }
  return details;
}

export function partLifecycleNoticeText(lifecycle: PartLifecycleInfo): string | null {
  const headline = partLifecycleStatusHeadline(lifecycle.status);
  if (!headline) {
    return null;
  }
  const details = partLifecycleDetailParts(lifecycle);
  return details.length > 0 ? `${headline} · ${details.join(" · ")}` : headline;
}
