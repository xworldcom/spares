"use client";

import Link from "next/link";
import { formatWhen } from "@/components/quote/quote-format";
import { careHref } from "@/lib/care";
import { displayNameFromEmail } from "@/lib/ui/display-name";
import type { UsageHistoryEntry } from "@/types";

function formatDay(value?: string) {
  if (!value) {
    return "—";
  }
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

export function ServiceVisitDetail({
  machineId,
  entry,
}: {
  machineId: string;
  entry: UsageHistoryEntry;
}) {
  const snapshot = entry.snapshot;
  const backHref = careHref(machineId, "service");

  return (
    <section className="care-card care-stack">
      <header className="care-card-head">
        <Link href={backHref} className="care-back">
          <span aria-hidden="true">‹</span> Service
        </Link>
        <h2>Service visit</h2>
        <p className="spares-muted text-sm">
          {displayNameFromEmail(entry.actorEmail)} · {formatWhen(entry.at)}
        </p>
      </header>

      <p className="care-row-title">{entry.summary}</p>

      {snapshot ? (
        <dl className="care-visit-fields">
          <div>
            <dt>Hours</dt>
            <dd>{snapshot.hours ?? "—"}</dd>
          </div>
          <div>
            <dt>Cycles</dt>
            <dd>{snapshot.cycles ?? "—"}</dd>
          </div>
          <div>
            <dt>Last service</dt>
            <dd>{formatDay(snapshot.lastServiceAt)}</dd>
          </div>
        </dl>
      ) : (
        <p className="spares-muted text-sm leading-relaxed">
          Field-level notes for this visit were not recorded. Only the summary
          above was saved.
        </p>
      )}

      <div className="care-field">
        <span className="text-sm font-semibold">Notes</span>
        <p className="spares-muted mt-2 whitespace-pre-wrap text-sm leading-relaxed">
          {snapshot?.notes?.trim() ? snapshot.notes : "No notes for this visit."}
        </p>
      </div>
    </section>
  );
}
