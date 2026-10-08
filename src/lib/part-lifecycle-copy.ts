import type { PartLifecycleInfo } from "@/types";

function formatLifecycleDay(value: string) {
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function partLifecycleStatusHeadline(status: PartLifecycleInfo["status"]) {
  if (status === "obsolete") {
    return "Discontinued";
  }
  if (status === "announced") {
    return "Discontinuation announced";
  }
  return null;
}

export function partLifecycleDetailParts(lifecycle: PartLifecycleInfo): string[] {
  const details: string[] = [];
  if (lifecycle.discontinuationDate) {
    details.push(`Ends ${formatLifecycleDay(lifecycle.discontinuationDate)}`);
  }
  if (lifecycle.lastTimeBuyDate) {
    details.push(`Last time buy ${formatLifecycleDay(lifecycle.lastTimeBuyDate)}`);
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
