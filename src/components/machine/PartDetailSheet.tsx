"use client";

import type { Part } from "@/lib/api/types";
import { PartLifecycleNotice } from "@/components/part-lifecycle/PartLifecycleNotice";

/** Customer part sheet (#273): only fields present on the part record. */
export function PartDetailSheet({ part }: { part: Part }) {
  const rows: Array<{ label: string; value: string }> = [];
  rows.push({ label: "Part number", value: part.id });
  if (part.vendor?.trim()) {
    rows.push({ label: "Vendor", value: part.vendor.trim() });
  }
  if (part.stock?.trim()) {
    rows.push({ label: "Stock", value: part.stock.trim() });
  }
  if (part.material?.trim()) {
    rows.push({ label: "Material", value: part.material.trim() });
  }
  if (part.weight?.trim()) {
    rows.push({ label: "Weight", value: part.weight.trim() });
  }
  if (part.category?.trim()) {
    rows.push({ label: "Category", value: part.category.trim() });
  }
  if (part.replaces?.trim()) {
    rows.push({ label: "Replaces", value: part.replaces.trim() });
  }

  return (
    <div className="space-y-2" data-part-detail="">
      <dl className="space-y-1.5">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="chrome-quiet text-[11px] font-medium tracking-wide uppercase">
              {row.label}
            </dt>
            <dd className="text-[13px] leading-snug break-all">{row.value}</dd>
          </div>
        ))}
      </dl>
      <PartLifecycleNotice lifecycle={part.lifecycle} />
    </div>
  );
}
