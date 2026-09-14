"use client";

import { useEffect, useState } from "react";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { formatWhen } from "@/components/quote/quote-format";
import { getMachineUsage, updateMachineUsage } from "@/lib/api/care";
import { errorMessage } from "@/lib/api/errors";
import { displayNameFromEmail } from "@/lib/ui/display-name";
import type { MachineUsage } from "@/types";

function dateInputValue(value?: string) {
  if (!value) {
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

export function UsagePanel({ machineId }: { machineId: string }) {
  const [usage, setUsage] = useState<MachineUsage | null>(null);
  const [hours, setHours] = useState("");
  const [cycles, setCycles] = useState("");
  const [lastServiceAt, setLastServiceAt] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  function apply(next: MachineUsage | null) {
    setUsage(next);
    setHours(next?.hours != null ? String(next.hours) : "");
    setCycles(next?.cycles != null ? String(next.cycles) : "");
    setLastServiceAt(dateInputValue(next?.lastServiceAt));
    setNotes(next?.notes ?? "");
  }

  useEffect(() => {
    let cancelled = false;
    getMachineUsage(machineId)
      .then((next) => {
        if (cancelled) {
          return;
        }
        apply(next);
        setError(null);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        setError(errorMessage(cause, "Could not load usage."));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [machineId, reloadKey]);

  async function onSave() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await updateMachineUsage(machineId, {
        hours: hours.trim() === "" ? null : Number(hours),
        cycles: cycles.trim() === "" ? null : Number(cycles),
        lastServiceAt: lastServiceAt.trim() || null,
        notes: notes.trim() || null,
      });
      apply(next);
      setNotice("Usage saved.");
    } catch (cause) {
      setError(errorMessage(cause, "Could not save usage."));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <LoadingState label="Loading usage…" />;
  }

  if (error && !usage && hours === "" && cycles === "") {
    return (
      <ErrorState
        title="Failed to load usage"
        message={error}
        onRetry={() => {
          setLoading(true);
          setReloadKey((key) => key + 1);
        }}
      />
    );
  }

  return (
    <div className="care-stack">
      <form
        className="care-card care-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave();
        }}
      >
        <h2>Staff usage</h2>
        <p className="spares-muted text-sm leading-relaxed">
          Hours, cycles, and last service stay on this machine. Customers do not
          see this tab.
        </p>
        <div className="care-form-grid">
          <label className="care-field">
            <span>Hours</span>
            <input
              inputMode="decimal"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              className="spares-field h-11 w-full rounded-2xl border-0 px-3 text-[16px] outline-none"
            />
          </label>
          <label className="care-field">
            <span>Cycles</span>
            <input
              inputMode="numeric"
              value={cycles}
              onChange={(event) => setCycles(event.target.value)}
              className="spares-field h-11 w-full rounded-2xl border-0 px-3 text-[16px] outline-none"
            />
          </label>
        </div>
        <label className="care-field">
          <span>Last service</span>
          <input
            type="date"
            value={lastServiceAt}
            onChange={(event) => setLastServiceAt(event.target.value)}
            className="spares-field h-11 w-full rounded-2xl border-0 px-3 text-[16px] outline-none"
          />
        </label>
        <label className="care-field">
          <span>Notes</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
            className="spares-field w-full rounded-2xl border-0 px-3 py-2 text-[16px] outline-none"
            placeholder="What the crew should remember next visit"
          />
        </label>
        {error ? (
          <p className="text-sm text-[#f0c4c0]" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="spares-muted text-sm" role="status">
            {notice}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="btn-primary inline-flex h-11 items-center justify-center rounded-full px-4 text-sm font-semibold disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save usage"}
        </button>
      </form>

      <section className="care-card">
        <header className="care-card-head">
          <h2>Edit history</h2>
        </header>
        {(usage?.history ?? []).length === 0 ? (
          <p className="spares-muted text-sm leading-relaxed">No edits yet.</p>
        ) : (
          <ol className="care-history">
            {usage?.history.map((entry) => (
              <li key={entry.id}>
                <p className="care-row-title">{entry.summary}</p>
                <p className="spares-muted text-sm">
                  {displayNameFromEmail(entry.actorEmail)} · {formatWhen(entry.at)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
