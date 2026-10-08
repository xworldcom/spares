"use client";

import Link from "next/link";
import { formatDay, formatWhen } from "@/components/quote/quote-format";
import { careHref } from "@/lib/care";
import { displayNameFromEmail } from "@/lib/ui/display-name";
import type { UsageHistoryEntry } from "@/types";

export function ServiceVisitDetail({
  machineId,
  entry,
}: {
  machineId: string;
  entry: UsageHistoryEntry;
}) {
  const snapshot = entry.snapshot;
  const backHref = careHref(machineId, "service");
  const showMeters =
    snapshot &&
    (snapshot.hours != null || snapshot.cycles != null);

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

      {snapshot ? (
        <div className="care-field">
          <span className="text-sm font-semibold">Last service</span>
          <p className="mt-1 text-[17px] font-semibold tracking-tight">
            {formatDay(snapshot.lastServiceAt)}
          </p>
        </div>
      ) : (
        <p className="spares-muted text-sm leading-relaxed">
          No stored details for this visit. See the summary below.
        </p>
      )}

      <div className="care-field">
        <span className="text-sm font-semibold">Notes</span>
        <p className="spares-muted mt-2 whitespace-pre-wrap text-sm leading-relaxed">
          {snapshot?.notes?.trim()
            ? snapshot.notes
            : "No notes for this visit."}
        </p>
      </div>

      {showMeters ? (
        <dl className="care-visit-fields care-visit-fields-optional">
          <div>
            <dt>Hours (optional)</dt>
            <dd>{snapshot?.hours ?? "—"}</dd>
          </div>
          <div>
            <dt>Cycles (optional)</dt>
            <dd>{snapshot?.cycles ?? "—"}</dd>
          </div>
        </dl>
      ) : null}

      <p className="spares-muted text-xs leading-relaxed">{entry.summary}</p>
    </section>
  );
}
