"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { MachineTypeahead } from "@/components/machine/MachineTypeahead";
import { listCustomerAccounts, listSites } from "@/lib/api/auth";
import { listMachines } from "@/lib/api/machines";
import { createTicket } from "@/lib/api/care";
import { errorMessage } from "@/lib/api/errors";
import type { CustomerAccount, MachineSummary, Site } from "@/types";

export function NewTicketForm({
  machineId,
  onCreated,
  onCancel,
}: {
  machineId?: string;
  onCreated: (ticketId: string, machineId: string) => void;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const [machines, setMachines] = useState<MachineSummary[]>([]);
  const [accounts, setAccounts] = useState<CustomerAccount[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState(machineId ?? "");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showMachinePicker = !machineId;
  const role = user?.role === "staff" ? "staff" : "customer";

  const customerSites = useMemo(() => user?.sites ?? [], [user?.sites]);

  useEffect(() => {
    if (machineId) {
      setSelectedMachineId(machineId);
      return;
    }
    let cancelled = false;
    const orgLoad =
      user?.role === "staff"
        ? Promise.all([listSites(), listCustomerAccounts()])
            .then(([nextSites, nextAccounts]) => ({
              sites: nextSites,
              accounts: nextAccounts,
            }))
            .catch(() => ({ sites: [] as Site[], accounts: [] as CustomerAccount[] }))
        : Promise.resolve({
            sites: customerSites,
            accounts: [] as CustomerAccount[],
          });
    Promise.all([listMachines(), orgLoad])
      .then(([next, org]) => {
        if (cancelled) {
          return;
        }
        setMachines(next);
        setSites(org.sites);
        setAccounts(org.accounts);
        if (next.length === 1) {
          setSelectedMachineId(next[0].id);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load machines.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [customerSites, machineId, user?.role]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedMachineId) {
      setError("Pick a machine for this ticket.");
      return;
    }
    if (!title.trim()) {
      setError("Add a short title for the ticket.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ticket = await createTicket(selectedMachineId, {
        title: title.trim(),
        note: note.trim() || undefined,
      });
      onCreated(ticket.id, selectedMachineId);
    } catch (cause) {
      setError(errorMessage(cause, "Could not open that ticket."));
      setBusy(false);
    }
  }

  return (
    <form className="care-card care-form" onSubmit={(event) => void onSubmit(event)}>
      <div className="care-card-head">
        <h2>New ticket</h2>
        <button
          type="button"
          className="spares-muted text-sm font-semibold"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
      <p className="spares-muted text-sm leading-relaxed">
        Tell staff what is happening. They will update status and write back here.
      </p>
      {showMachinePicker ? (
        <MachineTypeahead
          machines={machines}
          onMachines={setMachines}
          accounts={accounts}
          sites={sites}
          machineId={selectedMachineId}
          onMachineId={setSelectedMachineId}
          role={role}
          disabled={busy}
        />
      ) : null}
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
  );
}
