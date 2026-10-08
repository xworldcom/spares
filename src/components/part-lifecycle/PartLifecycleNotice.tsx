import {
  partLifecycleDetailParts,
  partLifecycleStatusHeadline,
} from "@/lib/part-lifecycle-copy";
import type { PartLifecycleInfo } from "@/types";

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
  const headline = partLifecycleStatusHeadline(lifecycle.status);
  if (!headline) {
    return null;
  }

  const details = partLifecycleDetailParts(lifecycle);

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
