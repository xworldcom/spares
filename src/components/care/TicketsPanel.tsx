"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TicketsList } from "@/components/care/TicketsList";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { createTicket, listMachineTickets } from "@/lib/api/care";
import { errorMessage } from "@/lib/api/errors";
import { ticketHref } from "@/lib/care";
import type { ServiceTicket } from "@/types";

export function TicketsPanel({ machineId }: { machineId: string }) {
  const router = useRouter();
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listMachineTickets(machineId)
      .then((next) => {
        if (cancelled) {
          return;
        }
        setTickets(next);
        setError(null);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        setError(errorMessage(cause, "Could not load tickets."));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [machineId, reloadKey]);

  async function onCreate() {
    if (!title.trim()) {
      setError("Add a short title for the ticket.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ticket = await createTicket(machineId, {
        title: title.trim(),
        note: note.trim() || undefined,
      });
      router.push(ticketHref(machineId, ticket.id));
    } catch (cause) {
      setError(errorMessage(cause, "Could not open that ticket."));
      setBusy(false);
    }
  }

  if (loading) {
    return <LoadingState label="Loading tickets…" />;
  }

  if (error && tickets.length === 0) {
    return (
      <ErrorState
        title="Failed to load tickets"
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
          void onCreate();
        }}
      >
        <h2>Open a ticket</h2>
        <p className="spares-muted text-sm leading-relaxed">
          Tell staff what is happening on this machine. They will update status
          and write back here.
        </p>
        <label className="care-field">
          <span>Title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="spares-field h-11 w-full rounded-2xl border-0 px-3 text-[16px] outline-none"
            placeholder="Belt slipping after changeover"
          />
        </label>
        <label className="care-field">
          <span>Note</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            className="spares-field w-full rounded-2xl border-0 px-3 py-2 text-[16px] outline-none"
            placeholder="Optional detail"
          />
        </label>
        {error ? (
          <p className="text-sm text-[#f0c4c0]" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="btn-primary inline-flex h-11 items-center justify-center rounded-full px-4 text-sm font-semibold disabled:opacity-60"
        >
          {busy ? "Opening…" : "Open ticket"}
        </button>
      </form>

      <TicketsList
        tickets={tickets}
        emptyTitle="No tickets yet"
        emptyMessage="Open a ticket when this machine needs service."
      />
    </div>
  );
}
