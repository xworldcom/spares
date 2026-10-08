"use client";

import type { Part } from "@/lib/api/types";
import { PartLifecycleNotice } from "@/components/part-lifecycle/PartLifecycleNotice";
import { partSheetRows } from "@/lib/ui/part-sheet";

/** Customer part sheet: only fields present on the part record, never invented ones. */
export function PartDetailSheet({ part }: { part: Part }) {
  const { rows, extra } = partSheetRows(part);

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
        {part.lifecycle ? (
          <div>
            <dt className="chrome-quiet text-[11px] font-medium tracking-wide uppercase">
              Lifecycle
            </dt>
            <dd>
              <PartLifecycleNotice lifecycle={part.lifecycle} />
            </dd>
          </div>
        ) : null}
      </dl>
      {!extra && !part.lifecycle ? (
        <p className="chrome-quiet text-[12px]" data-part-detail-empty="">
          No other details on file for this part.
        </p>
      ) : null}
    </div>
  );
}
