"use client";

import type { Part } from "@/lib/api/types";
import { PartLifecycleNotice } from "@/components/part-lifecycle/PartLifecycleNotice";
import { partLifecycleStatusLabel } from "@/lib/part-lifecycle-copy";
import { partSheetRows } from "@/lib/ui/part-sheet";
import type { PartLifecycleInfo } from "@/types";

/** Customer part sheet: only fields present on the part record, never invented ones. */
export function PartDetailSheet({ part }: { part: Part }) {
  const { rows, extra } = partSheetRows(part);
  const lifecycle: PartLifecycleInfo = part.lifecycle ?? { status: "unknown" };

  return (
    <div className="space-y-2" data-part-detail="">
      <dl className="space-y-1.5">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="chrome-quiet text-[11px] font-medium tracking-wide uppercase">
              {row.label}
            </dt>
            <dd className="text-[13px] leading-snug break-words">{row.value}</dd>
          </div>
        ))}
        <div data-part-lifecycle="">
          <dt className="chrome-quiet text-[11px] font-medium tracking-wide uppercase">
            Lifecycle
          </dt>
          <dd className="text-[13px] leading-snug">
            <span className="sr-only">{partLifecycleStatusLabel(lifecycle.status)}</span>
            <PartLifecycleNotice lifecycle={lifecycle} />
          </dd>
        </div>
      </dl>
      {!extra ? (
        <p className="chrome-quiet text-[12px]" data-part-detail-empty="">
          No other details on file for this part.
        </p>
      ) : null}
    </div>
  );
}
