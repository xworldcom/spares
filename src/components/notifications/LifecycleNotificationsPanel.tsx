"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import {
  fetchLifecycleNotifications,
  markAllLifecycleNotificationsRead,
  markLifecycleNotificationRead,
  type LifecycleNotification,
  type LifecycleNotificationsResponse,
} from "@/lib/api/lifecycle-notifications";
import { useSeedListSlotOnce } from "@/lib/ui/use-seed-list-slot";
import { errorMessage } from "@/lib/api/errors";
import { useLifecycleAlerts } from "@/components/notifications/LifecycleAlerts";
import { formatWhen } from "@/components/quote/quote-format";
import { partLifecycleStatusLabel } from "@/lib/part-lifecycle-copy";

function machineLabel(row: LifecycleNotification) {
  return row.machineNames.length > 0 ? row.machineNames.join(" · ") : "—";
}

const LIFECYCLE_LIST_PATH = "/api/notifications/lifecycle";
const LIFECYCLE_LIST_WARM_KEY = "lifecycle:notifications";

export function LifecycleNotificationsPanel({
  initialList,
  listEtag,
}: {
  initialList?: LifecycleNotificationsResponse | null;
  listEtag?: string | null;
}) {
  const { user } = useAuth();
  const { refresh: refreshAlerts } = useLifecycleAlerts();
  useSeedListSlotOnce(
    LIFECYCLE_LIST_WARM_KEY,
    LIFECYCLE_LIST_PATH,
    initialList,
    listEtag,
  );
  const [rows, setRows] = useState<LifecycleNotification[]>(
    initialList?.notifications ?? [],
  );
  const [loading, setLoading] = useState(!initialList);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(
    async (fresh = false) => {
      const skipFetch = Boolean(initialList) && reloadKey === 0 && !fresh;
      const background = reloadKey > 0 && !fresh;
      if (!skipFetch && !background) {
        setLoading(true);
      }
      setError(null);
      try {
        const data = skipFetch
          ? initialList!
          : await fetchLifecycleNotifications({ fresh, background });
        setRows(data.notifications);
      } catch (cause) {
        setError(errorMessage(cause, "Could not load part alerts."));
        if (!background) {
          setRows([]);
        }
      } finally {
        setLoading(false);
      }
    },
    [initialList, reloadKey],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function openRow(row: LifecycleNotification) {
    if (row.unread) {
      try {
        await markLifecycleNotificationRead(row.id);
        await refreshAlerts();
        setRows((current) =>
          current.map((item) =>
            item.id === row.id ? { ...item, unread: false, readAt: new Date().toISOString() } : item,
          ),
        );
      } catch {
        /* keep navigation */
      }
    }
  }

  async function markAll() {
    try {
      await markAllLifecycleNotificationsRead();
      await refreshAlerts();
      setReloadKey((key) => key + 1);
      await load();
    } catch (cause) {
      setError(errorMessage(cause, "Could not mark all read."));
    }
  }

  const partsHref =
    user?.role === "staff" ? "/staff/parts" : "/machines";

  if (loading && rows.length === 0) {
    return <LoadingState label="Loading part alerts…" />;
  }

  if (error && rows.length === 0) {
    return (
      <ErrorState
        message={error}
        onRetry={() => {
          setReloadKey((key) => key + 1);
          void load(true);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="spares-muted text-sm">
          Obsolete parts that affect your machines. One alert per part number.
        </p>
        {rows.some((row) => row.unread) ? (
          <button type="button" className="btn-soft text-sm" onClick={() => void markAll()}>
            Mark all read
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="text-sm text-[#f0c4c0]" role="alert">
          {error}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title="No obsolete part alerts" message="You are caught up." />
      ) : (
        <ol className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className={`spares-surface rounded-[22px] px-4 py-4 ${
                row.unread ? "ring-1 ring-[#e8c27a]/50" : ""
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[15px] font-semibold tracking-tight">
                  {row.partName}
                  <span className="spares-muted ml-2 font-mono text-xs font-normal">
                    {row.partNumber}
                  </span>
                </p>
                <time className="spares-muted text-xs tabular-nums" dateTime={row.createdAt}>
                  {formatWhen(row.createdAt)}
                </time>
              </div>
              <p className="mt-1 text-sm">
                {partLifecycleStatusLabel(row.lifecycleStatus)} · Used on {machineLabel(row)}
              </p>
              {row.discontinuationDate ? (
                <p className="spares-muted mt-1 text-xs">Ends {row.discontinuationDate}</p>
              ) : null}
              {row.successorPartNumber ? (
                <p className="spares-muted mt-1 text-xs">
                  Replacement: <span className="font-mono">{row.successorPartNumber}</span>
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`${partsHref}?q=${encodeURIComponent(row.partNumber)}&highlight=${encodeURIComponent(row.partNumber)}`}
                  className="btn-primary inline-flex h-9 items-center rounded-full px-4 text-[13px] font-semibold"
                  onClick={() => void openRow(row)}
                >
                  View part
                </Link>
                {row.unread ? (
                  <button
                    type="button"
                    className="btn-soft inline-flex h-9 items-center rounded-full px-4 text-[13px] font-medium"
                    onClick={() => void openRow(row)}
                  >
                    Mark read
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
