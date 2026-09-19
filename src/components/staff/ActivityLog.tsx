"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import {
  ACTIVITY_ACTION_LABELS,
  type ActivityAccount,
  type ActivityEvent,
} from "@/lib/activity-log-types";
import { listActivityLog } from "@/lib/api/activity";
import { errorMessage } from "@/lib/api/errors";
import { ACTIVITY_LOG_POLL_MS } from "@/lib/hooks/conversation-poll-constants";
import { useConversationPoll } from "@/lib/hooks/useConversationPoll";

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function actorLabel(event: ActivityEvent) {
  return event.actorName || event.actorEmail || event.actorUserId || "System";
}

function sameEvents(left: ActivityEvent[], right: ActivityEvent[]) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((row, index) => row.id === right[index]?.id);
}

export function ActivityLog() {
  const { user } = useAuth();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [accounts, setAccounts] = useState<ActivityAccount[]>([]);
  const [total, setTotal] = useState(0);
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [older, setOlder] = useState<ActivityEvent[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await listActivityLog({
        account: account || undefined,
      });
      setEvents((current) => (sameEvents(current, data.events) ? current : data.events));
      setAccounts(data.accounts);
      setTotal(data.total);
      setGeneratedAt(data.generatedAt);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, "Could not load Activity Log."));
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    setOlder([]);
  }, [account]);

  useEffect(() => {
    void load();
  }, [load]);

  useConversationPoll(true, load, ACTIVITY_LOG_POLL_MS);

  const visible = useMemo(() => [...events, ...older], [events, older]);

  async function loadEarlier() {
    const oldest = visible[visible.length - 1];
    if (!oldest) {
      return;
    }
    try {
      const data = await listActivityLog({
        account: account || undefined,
        before: oldest.at,
      });
      setOlder((current) => [...current, ...data.events]);
    } catch (cause) {
      setError(errorMessage(cause, "Could not load earlier activity."));
    }
  }

  if (loading && events.length === 0) {
    return <LoadingState label="Loading Activity Log…" />;
  }

  if (error && events.length === 0) {
    return (
      <ErrorState
        title="Failed to load Activity Log"
        message={error}
        onRetry={() => {
          setLoading(true);
          void load();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="activity-account">
          Filter by account
        </label>
        <select
          id="activity-account"
          value={account}
          onChange={(event) => {
            setLoading(true);
            setAccount(event.target.value);
          }}
          className="spares-field h-11 min-w-[16rem] rounded-2xl border-0 px-4 text-[15px] outline-none"
        >
          <option value="">All accounts</option>
          {accounts.map((row) => {
            const value = row.email || row.userId || "";
            return (
              <option key={value} value={value}>
                {row.name && row.email && row.name !== row.email
                  ? `${row.name} · ${row.email}`
                  : row.email || row.name || row.userId}
              </option>
            );
          })}
        </select>
        <p className="spares-muted text-sm tabular-nums">
          {visible.length}
          {total > visible.length ? ` of ${total}` : ""}{" "}
          {visible.length === 1 ? "entry" : "entries"}
        </p>
        <p className="ml-auto inline-flex items-center gap-2 text-sm font-medium">
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </span>
          Live
          {generatedAt ? (
            <span className="spares-muted font-normal">
              Updated {formatWhen(generatedAt)}
            </span>
          ) : null}
        </p>
      </div>

      {error ? (
        <p className="text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          title="No activity yet"
          message="Sign-ins, staff changes, quotes, tickets, and host updates will appear here and stay on the record."
        />
      ) : (
        <ol className="space-y-3">
          {visible.map((event) => (
            <li key={event.id} className="spares-surface rounded-[24px] px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold tracking-tight">
                  {ACTIVITY_ACTION_LABELS[event.action] ?? event.action}
                </p>
                <time className="spares-muted text-xs tabular-nums" dateTime={event.at}>
                  {formatWhen(event.at)}
                </time>
              </div>
              <p className="mt-1 text-[15px] leading-relaxed">{event.summary}</p>
              <p className="spares-muted mt-2 text-xs">
                {actorLabel(event)}
                {event.actorRole ? ` · ${event.actorRole}` : ""}
                {event.target?.label ? ` · ${event.target.label}` : ""}
                {user?.platformOwner ? ` · ${event.tenantId}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}

      {visible.length < total ? (
        <button type="button" className="btn-soft" onClick={() => void loadEarlier()}>
          Load earlier
        </button>
      ) : null}

      <p className="spares-muted text-xs">
        Permanent record. Entries cannot be deleted.
      </p>
    </div>
  );
}
