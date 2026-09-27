"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { formatWhen } from "@/components/quote/quote-format";
import { ServiceVisitDetail } from "@/components/care/ServiceVisitDetail";
import { getMachineUsage, updateMachineUsage } from "@/lib/api/care";
import { errorMessage } from "@/lib/api/errors";
import { careHref, serviceVisitHref } from "@/lib/care";
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

export function ServicePanel({
  machineId,
  visitId,
}: {
  machineId: string;
  visitId?: string;
}) {
  const { user } = useAuth();
  const staff = user?.role === "staff";
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
        setError(errorMessage(cause, "Could not load service log."));
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
      const patch: {
        hours?: number | null;
        cycles?: number | null;
        lastServiceAt?: string | null;
        notes?: string | null;
      } = {
        lastServiceAt: lastServiceAt.trim() || null,
        notes: notes.trim() || null,
      };
      if (hours.trim() !== "") {
        patch.hours = Number(hours);
      }
      if (cycles.trim() !== "") {
        patch.cycles = Number(cycles);
      }
      const next = await updateMachineUsage(machineId, patch);
      apply(next);
      setNotice("Visit saved.");
    } catch (cause) {
      setError(errorMessage(cause, "Could not save service."));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <LoadingState label="Loading service…" />;
  }

  const selectedVisit = visitId
    ? usage?.history.find((entry) => entry.id === visitId) ?? null
    : null;

  if (visitId && !selectedVisit && !loading) {
    return (
      <ErrorState
        title="Visit not found"
        message="This service visit is no longer in the edit history."
        onRetry={() => {
          window.location.href = careHref(machineId, "service");
        }}
      />
    );
  }

  if (visitId && selectedVisit) {
    return <ServiceVisitDetail machineId={machineId} entry={selectedVisit} />;
  }

  if (error && !usage && hours === "" && cycles === "") {
    return (
      <ErrorState
        title="Failed to load service log"
        message={error}
        onRetry={() => {
          setLoading(true);
          setReloadKey((key) => key + 1);
        }}
      />
    );
  }

  const showMeters =
    usage &&
    (usage.hours != null || usage.cycles != null);

  return (
    <div className="care-stack">
      {staff ? (
      <form
        className="care-card care-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave();
        }}
      >
        <h2>Service</h2>
        <p className="spares-muted text-sm leading-relaxed">
          Log a service visit with the date and what the tech did on site. No live
          meters required. Customers see visit notes here after you save.
        </p>
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
            rows={5}
            className="spares-field w-full rounded-2xl border-0 px-3 py-2 text-[16px] outline-none"
            placeholder="Preventative maintenance performed, parts replaced, follow-ups…"
          />
        </label>
        <details className="care-optional-meters">
          <summary className="spares-muted text-sm font-semibold">
            Optional meters (if known)
          </summary>
          <div className="care-form-grid care-optional-meters-fields">
            <label className="care-field">
              <span>Hours</span>
              <input
                inputMode="decimal"
                value={hours}
                onChange={(event) => setHours(event.target.value)}
                placeholder="Not required"
                className="spares-field h-11 w-full rounded-2xl border-0 px-3 text-[16px] outline-none"
              />
            </label>
            <label className="care-field">
              <span>Cycles</span>
              <input
                inputMode="numeric"
                value={cycles}
                onChange={(event) => setCycles(event.target.value)}
                placeholder="Not required"
                className="spares-field h-11 w-full rounded-2xl border-0 px-3 text-[16px] outline-none"
              />
            </label>
          </div>
        </details>
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
          {busy ? "Saving…" : "Save visit"}
        </button>
      </form>
      ) : (
        <section className="care-card care-stack">
          <header className="care-card-head">
            <h2>Service</h2>
            <p className="spares-muted text-sm leading-relaxed">
              Onsite service visits logged by your service team for this machine.
            </p>
          </header>
          <div className="care-field">
            <span className="text-sm font-semibold">Last service</span>
            <p className="mt-1 text-[17px] font-semibold tracking-tight">
              {formatDay(usage?.lastServiceAt)}
            </p>
          </div>
          <div className="care-field">
            <span className="text-sm font-semibold">Notes</span>
            <p className="spares-muted mt-2 whitespace-pre-wrap text-sm leading-relaxed">
              {usage?.notes?.trim()
                ? usage.notes
                : "No notes from the latest visit yet."}
            </p>
          </div>
          {showMeters ? (
            <dl className="care-visit-fields care-visit-fields-optional">
              <div>
                <dt>Hours (optional)</dt>
                <dd>{usage?.hours ?? "—"}</dd>
              </div>
              <div>
                <dt>Cycles (optional)</dt>
                <dd>{usage?.cycles ?? "—"}</dd>
              </div>
            </dl>
          ) : null}
        </section>
      )}

      <section className="care-card">
        <header className="care-card-head">
          <h2>{staff ? "Edit history" : "Visit history"}</h2>
        </header>
        {(usage?.history ?? []).length === 0 ? (
          <p className="spares-muted text-sm leading-relaxed">
            {staff ? "No edits yet." : "No service visits logged yet."}
          </p>
        ) : (
          <ul className="care-list">
            {usage?.history.map((entry) => (
              <li key={entry.id}>
                <Link
                  href={serviceVisitHref(machineId, entry.id)}
                  className="care-row"
                >
                  <div>
                    <p className="care-row-title">{entry.summary}</p>
                    <p className="spares-muted text-sm">
                      {displayNameFromEmail(entry.actorEmail)} ·{" "}
                      {formatWhen(entry.at)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
