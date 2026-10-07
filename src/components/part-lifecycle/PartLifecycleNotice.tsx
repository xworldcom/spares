import type { PartLifecycleInfo } from "@/types";

function statusHeadline(status: PartLifecycleInfo["status"]) {
  if (status === "obsolete") {
    return "Discontinued";
  }
  if (status === "announced") {
    return "Discontinuation announced";
  }
  return null;
}

export function PartLifecycleNotice({
  lifecycle,
  compact,
}: {
  lifecycle?: PartLifecycleInfo;
  compact?: boolean;
}) {
  if (!lifecycle) {
    return null;
  }
  const headline = statusHeadline(lifecycle.status);
  if (!headline) {
    return null;
  }

  const details: string[] = [];
  if (lifecycle.discontinuationDate) {
    details.push(`Ends ${lifecycle.discontinuationDate}`);
  }
  if (lifecycle.lastTimeBuyDate) {
    details.push(`Last time buy ${lifecycle.lastTimeBuyDate}`);
  }
  if (lifecycle.successorPartNumber) {
    details.push(`Use ${lifecycle.successorPartNumber}`);
  }

  return (
    <p
      className={`${
        compact ? "text-[11px] leading-snug" : "text-[12px] leading-snug"
      } ${
        lifecycle.status === "obsolete"
          ? "text-[#f0c4c0]"
          : "text-[#f5d0a8]"
      }`}
      role="status"
    >
      <span className="font-medium">{headline}</span>
      {details.length > 0 ? ` · ${details.join(" · ")}` : null}
    </p>
  );
}
