"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { MachineTypeahead } from "@/components/machine/MachineTypeahead";
import {
  ManualQuoteLines,
  type ManualQuoteLine,
} from "@/components/quote/ManualQuoteLines";
import { listCustomerAccounts, listSites } from "@/lib/api/auth";
import { listMachines } from "@/lib/api/machines";
import { createQuote } from "@/lib/api/quotes";
import { errorMessage } from "@/lib/api/errors";
import { quoteHref } from "@/lib/quotes";
import type { CustomerAccount, MachineSummary, Site } from "@/types";

export function NewQuoteForm({
  onCreated,
  onCancel,
}: {
  onCreated: (href: string) => void;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const [machines, setMachines] = useState<MachineSummary[]>([]);
  const [accounts, setAccounts] = useState<CustomerAccount[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [machineId, setMachineId] = useState("");
  const [lines, setLines] = useState<ManualQuoteLine[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const customerSites = useMemo(() => user?.sites ?? [], [user?.sites]);

  useEffect(() => {
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
          setMachineId(next[0].id);
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
  }, [customerSites, user?.role]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!machineId) {
      setError("Pick a machine for this quote.");
      return;
    }
    if (lines.length === 0) {
      setError("Add at least one part.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createQuote({
        machineId,
        items: lines.map((line) => ({
          id: line.id,
          name: line.name,
          qty: line.qty,
        })),
        note: note.trim() || undefined,
      });
      onCreated(quoteHref("customer", created));
    } catch (cause) {
      setError(errorMessage(cause, "Could not request that quote."));
      setBusy(false);
    }
  }

  return (
    <form className="care-card care-form" onSubmit={(event) => void onSubmit(event)}>
      <div className="care-card-head">
        <h2>New quote</h2>
        <button
          type="button"
          className="spares-muted text-sm font-semibold"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
      <p className="spares-muted text-sm leading-relaxed">
        Type a machine name if it is not listed. Add parts by number and description.
      </p>
      <MachineTypeahead
        machines={machines}
        onMachines={setMachines}
        accounts={accounts}
        sites={sites}
        machineId={machineId}
        onMachineId={setMachineId}
        role="customer"
        disabled={busy}
      />
      <ManualQuoteLines
        lines={lines}
        onAdd={(line) => setLines((current) => [...current, line])}
        onQty={(id, qty) =>
          setLines((current) =>
            current.map((line) => (line.id === id ? { ...line, qty } : line)),
          )
        }
        onRemove={(id) =>
          setLines((current) => current.filter((line) => line.id !== id))
        }
      />
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
        {busy ? "Sending…" : "Request quote"}
      </button>
    </form>
  );
}
