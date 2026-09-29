"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { MachineTypeahead } from "@/components/machine/MachineTypeahead";
import {
  ManualQuoteLines,
  type ManualQuoteLine,
} from "@/components/quote/ManualQuoteLines";
import { listCustomerAccounts, listCustomers, listSites } from "@/lib/api/auth";
import { listMachines } from "@/lib/api/machines";
import { createQuote } from "@/lib/api/quotes";
import { errorMessage } from "@/lib/api/errors";
import { SearchableSelect } from "@/components/staff/SearchableSelect";
import { grantFromUser, staffQuotePersonScope } from "@/lib/access";
import { sitesForMachineCreate } from "@/lib/machines";
import { quoteHref } from "@/lib/quotes";
import { displayPersonName } from "@/lib/ui/display-name";
import type { CustomerAccount, MachineSummary, PublicUser, Role, Site } from "@/types";

export function NewQuoteForm({
  role = "customer",
  initialMachineId,
  onCreated,
  onCancel,
}: {
  role?: Role;
  initialMachineId?: string;
  onCreated: (href: string) => void;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const [machines, setMachines] = useState<MachineSummary[]>([]);
  const [accounts, setAccounts] = useState<CustomerAccount[]>([]);
  const [people, setPeople] = useState<PublicUser[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [personId, setPersonId] = useState("");
  const [machineId, setMachineId] = useState(initialMachineId ?? "");
  const [lines, setLines] = useState<ManualQuoteLine[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const customerSites = useMemo(() => user?.sites ?? [], [user?.sites]);
  const staff = role === "staff";
  const person = useMemo(
    () => people.find((row) => row.id === personId),
    [people, personId],
  );
  const quoteScope = useMemo(
    () =>
      person
        ? staffQuotePersonScope(grantFromUser(person), sites, machines, accounts)
        : null,
    [accounts, machines, person, sites],
  );
  const personAccountId = quoteScope?.accountId ?? "";
  const quoteAccounts = quoteScope?.accounts ?? [];
  const quoteSites = staff ? (quoteScope?.sites ?? []) : sites;
  const quoteMachines =
    staff && personAccountId ? (quoteScope?.machines ?? []) : machines;
  const lockedMachine =
    initialMachineId
      ? machines.find((row) => row.id === initialMachineId) ??
        quoteMachines.find((row) => row.id === initialMachineId)
      : undefined;
  const lockedMachineBlocked =
    Boolean(initialMachineId) &&
    staff &&
    Boolean(personAccountId) &&
    !quoteMachines.some((row) => row.id === initialMachineId);

  useEffect(() => {
    let cancelled = false;
    const orgLoad = staff
      ? Promise.all([listSites(), listCustomerAccounts(), listCustomers()])
          .then(([nextSites, nextAccounts, nextPeople]) => ({
            sites: nextSites,
            accounts: nextAccounts,
            people: nextPeople.filter((row) => !row.deletedAt && row.role === "customer"),
          }))
          .catch(() => ({
            sites: [] as Site[],
            accounts: [] as CustomerAccount[],
            people: [] as PublicUser[],
          }))
      : Promise.resolve({
          sites: customerSites,
          accounts: [] as CustomerAccount[],
          people: [] as PublicUser[],
        });
    Promise.all([listMachines(), orgLoad])
      .then(([next, org]) => {
        if (cancelled) {
          return;
        }
        setMachines(next);
        setSites(staff ? org.sites : sitesForMachineCreate(org.sites, next));
        setAccounts(org.accounts);
        setPeople(org.people);
        if (org.people.length === 1) {
          setPersonId(org.people[0].id);
        }
        if (initialMachineId) {
          setMachineId(initialMachineId);
        } else if (!staff && next.length === 1) {
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
  }, [customerSites, initialMachineId, staff]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (staff && !personId) {
      setError("Pick a customer for this quote.");
      return;
    }
    if (staff && !personAccountId) {
      setError("This person has no customer yet.");
      return;
    }
    if (!machineId) {
      setError("Pick a machine for this quote.");
      return;
    }
    if (lockedMachineBlocked) {
      setError("This customer cannot access this machine.");
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
        ...(staff ? { customerId: personId } : {}),
      });
      onCreated(quoteHref(role, created));
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
      {initialMachineId ? (
        <p className="spares-muted text-sm leading-relaxed">This quote stays on this machine.</p>
      ) : null}
      {staff ? (
        <SearchableSelect
          id="quote-customer-person"
          label="Customer"
          options={people.map((row) => ({
            value: row.id,
            label: displayPersonName(row),
          }))}
          value={personId}
          onChange={(next) => {
            setPersonId(next);
            setMachineId(initialMachineId ?? "");
            setError(null);
          }}
          placeholder="Search people…"
        />
      ) : null}
      {staff && personId && !personAccountId ? (
        <p className="text-sm text-[#f0c4c0]" role="alert">
          This person has no customer yet. Grant them a site in People first.
        </p>
      ) : null}
      {initialMachineId ? (
        <p className="text-sm leading-relaxed">
          <span className="spares-muted">Machine · </span>
          {lockedMachine?.name ?? "This machine"}
        </p>
      ) : (
        <MachineTypeahead
          key={personId || "machine"}
          machines={quoteMachines}
          onMachines={setMachines}
          accounts={staff ? quoteAccounts : accounts}
          sites={quoteSites}
          machineId={machineId}
          onMachineId={setMachineId}
          role={role}
          disabled={busy || (staff && !personAccountId)}
          lockAccount={staff && Boolean(personAccountId)}
        />
      )}
      {lockedMachineBlocked ? (
        <p className="text-sm text-[#f0c4c0]" role="alert">
          This customer cannot access this machine. Pick someone at this plant.
        </p>
      ) : null}
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
        disabled={busy || lockedMachineBlocked}
        className="btn-primary inline-flex h-11 items-center justify-center rounded-full px-4 text-sm font-semibold disabled:opacity-60"
      >
        {busy ? "Sending…" : staff ? "Create quote" : "Request quote"}
      </button>
    </form>
  );
}
