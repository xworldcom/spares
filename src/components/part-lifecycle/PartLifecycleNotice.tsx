import {
  partLifecycleDetailParts,
  partLifecycleStatusHeadline,
  partLifecycleStatusLabel,
} from "@/lib/part-lifecycle-copy";
import type { PartLifecycleInfo } from "@/types";

export function PartLifecycleNotice({
  lifecycle,
  compact,
  onLightBackground = false,
}: {
  lifecycle?: PartLifecycleInfo;
  compact?: boolean;
  /** Selected BOM row (`row-on-ink`) — use dark at-risk colors for ≥4.5:1 contrast. */
  onLightBackground?: boolean;
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
          ? onLightBackground
            ? "text-[#8b2e28]"
            : "text-[#ffd6d0]"
          : status === "announced"
            ? onLightBackground
              ? "text-[#7a4a12]"
              : "text-[#ffe4c2]"
            : "chrome-quiet"
      }`}
      role="status"
    >
      <span className={atRisk ? "font-medium" : undefined}>{headline}</span>
      {details.length > 0 ? ` · ${details.join(" · ")}` : null}
    </p>
  );
}
