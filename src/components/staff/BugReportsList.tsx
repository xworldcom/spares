"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { listBugReports } from "@/lib/api/bugs";
import { useSeedListSlotOnce } from "@/lib/ui/use-seed-list-slot";
import type { BugReportsListResponse } from "@/lib/api/types";
import { errorMessage } from "@/lib/api/errors";
import type { BugReport } from "@/lib/api/types";
import { formatWhen } from "@/components/quote/quote-format";

const BUG_REPORTS_PATH = "/api/bugs";
const BUG_REPORTS_WARM_KEY = "bugs:list";

export function BugReportsList({
  initialList,
  listEtag,
}: {
  initialList?: BugReportsListResponse | null;
  listEtag?: string | null;
}) {
  useSeedListSlotOnce(BUG_REPORTS_WARM_KEY, BUG_REPORTS_PATH, initialList, listEtag);
  const [reports, setReports] = useState<BugReport[]>(initialList?.reports ?? []);
  const [loading, setLoading] = useState(!initialList);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const skipFetch = Boolean(initialList) && reloadKey === 0;
    const background = reloadKey > 0;
    if (!skipFetch && !background) {
      setLoading(true);
    }
    const load = skipFetch
      ? Promise.resolve(initialList?.reports ?? [])
      : listBugReports();
    load
      .then((next) => {
        if (cancelled) {
          return;
        }
        setReports(next);
        setError(null);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        setError(errorMessage(cause, "Could not load bug reports."));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialList, reloadKey]);

  if (loading) {
    return <LoadingState label="Loading bug reports…" />;
  }

  if (error) {
    return (
      <ErrorState
        title="Failed to load bug reports"
        message={error}
        onRetry={() => {
          setLoading(true);
          setReloadKey((key) => key + 1);
        }}
      />
    );
  }

  if (reports.length === 0) {
    return (
      <EmptyState
        title="No bug reports"
        message="Reports land here when GitHub delivery fails."
      />
    );
  }

  return (
    <ul className="space-y-4">
      {reports.map((report) => (
        <li
          key={report.id}
          className="spares-surface overflow-hidden rounded-[24px]"
        >
          <div className="grid gap-4 p-4 md:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]">
            <div className="spares-field overflow-hidden rounded-md border border-white/8">
              {report.screenshotUrl ? (
                // Staff-only same-origin JPEG from the file store.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={report.screenshotUrl}
                  alt="Bug report screenshot"
                  className="spares-field h-auto w-full object-contain"
                />
              ) : (
                <p className="spares-muted px-3 py-8 text-center text-xs">
                  No screenshot
                </p>
              )}
            </div>
            <div className="min-w-0 space-y-2">
              <p className="text-sm whitespace-pre-wrap">
                {report.description}
              </p>
              <p className="spares-muted text-xs">
                {formatWhen(report.createdAt)}
                {report.userEmail
                  ? ` · ${report.userEmail}${report.userRole ? ` (${report.userRole})` : ""}`
                  : " · signed out"}
                {` · ${report.path}`}
              </p>
              {report.githubIssueUrl ? (
                <a
                  href={report.githubIssueUrl}
                  className="spares-muted text-xs underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub issue
                </a>
              ) : (
                <p className="spares-muted text-xs">Stored in-app only</p>
              )}
              {report.logText ? (
                <details className="spares-muted text-xs">
                  <summary className="cursor-pointer select-none">Client log</summary>
                  <pre className="spares-field mt-2 max-h-48 overflow-auto rounded-md p-2 whitespace-pre-wrap">
                    {report.logText}
                  </pre>
                </details>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
