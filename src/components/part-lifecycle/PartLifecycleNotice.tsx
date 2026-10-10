import {
  partLifecycleDetailParts,
  partLifecycleStatusHeadline,
  partLifecycleStatusLabel,
} from "@/lib/part-lifecycle-copy";
import type { PartLifecycleInfo } from "@/types";

export function PartLifecycleNotice({
  lifecycle,
  compact,
}: {
  lifecycle?: PartLifecycleInfo;
  compact?: boolean;
}) {
  const status = lifecycle?.status ?? "unknown";
  const atRisk = status === "obsolete" || status === "announced";
  const headline = atRisk
    ? partLifecycleStatusHeadline(status)
    : partLifecycleStatusLabel(status);
  const details = lifecycle && atRisk ? partLifecycleDetailParts(lifecycle) : [];

  return (
    <p
      className={`${
        compact ? "text-[11px] leading-snug" : "text-[12px] leading-snug"
      } ${
        status === "obsolete"
          ? "text-[#f0c4c0]"
          : status === "announced"
            ? "text-[#f5d0a8]"
            : "chrome-quiet"
      }`}
      role="status"
    >
      <span className={atRisk ? "font-medium" : undefined}>{headline}</span>
      {details.length > 0 ? ` · ${details.join(" · ")}` : null}
    </p>
  );
}
