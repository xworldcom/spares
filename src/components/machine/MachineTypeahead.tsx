"use client";

import { useMemo, useState } from "react";
import { MachineSitePicker } from "@/components/staff/MachineSitePicker";
import { SearchableSelect } from "@/components/staff/SearchableSelect";
import { createModelLessMachine } from "@/lib/api/machines";
import { errorMessage } from "@/lib/api/errors";
import { siteLabel } from "@/lib/access";
import { machineHasModel, machineNameKey, normalizeMachineName } from "@/lib/machines";
import type { CustomerAccount, MachineSummary, Role, Site } from "@/lib/api/types";

function machineOptionLabel(
  machine: MachineSummary,
  accounts: readonly CustomerAccount[],
) {
  if (machine.company && machine.siteName) {
    return `${machine.name} · ${siteLabel({ company: machine.company, name: machine.siteName }, accounts)}`;
  }
  if (machine.siteName) {
    return `${machine.name} · ${machine.siteName}`;
  }
  return machine.name;
}

export function MachineTypeahead({
  machines,
  onMachines,
  accounts,
  sites,
  machineId,
  onMachineId,
  role,
  disabled = false,
}: {
  machines: readonly MachineSummary[];
  onMachines?: (machines: MachineSummary[]) => void;
  accounts: readonly CustomerAccount[];
  sites: readonly Site[];
  machineId: string;
  onMachineId: (machineId: string) => void;
  role: Role;
  disabled?: boolean;
}) {
  const [pendingName, setPendingName] = useState("");
  const [siteId, setSiteId] = useState("");
  const [oem, setOem] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(
    () =>
      machines.map((machine) => ({
        value: machine.id,
        label: machineOptionLabel(machine, accounts),
      })),
    [accounts, machines],
  );

  const createSites = useMemo(
    () => sites.filter((row) => !row.deletedAt),
    [sites],
  );

  async function createAtSite(name: string, nextSiteId: string) {
    setBusy(true);
    setError(null);
    try {
      const created = await createModelLessMachine({
        name,
        siteId: nextSiteId,
        oem: oem.trim() || undefined,
      });
      const summary: MachineSummary = {
        id: created.id,
        name: created.name,
        siteId: created.siteId,
        company: created.company,
        siteName: created.siteName,
        version: created.version,
        hasModel: machineHasModel(created),
      };
      onMachines?.([
        ...machines.filter((row) => row.id !== summary.id),
        summary,
      ]);
      onMachineId(created.id);
      setPendingName("");
      setOem("");
    } catch (cause) {
      setError(errorMessage(cause, "Could not add that machine."));
    } finally {
      setBusy(false);
    }
  }

  function startCreate(query: string) {
    const name = normalizeMachineName(query);
    if (!name) {
      return;
    }
    const match = machines.find((row) => machineNameKey(row.name) === machineNameKey(name));
    if (match && createSites.length <= 1) {
      onMachineId(match.id);
      return;
    }
    if (createSites.length === 1) {
      void createAtSite(name, createSites[0].id);
      return;
    }
    setPendingName(name);
    setSiteId(createSites[0]?.id ?? "");
    setError(null);
  }

  return (
    <div className="machine-typeahead">
      <SearchableSelect
        id="machine-typeahead"
        label="Machine"
        options={options}
        value={machineId}
        onChange={(next) => {
          onMachineId(next);
          setPendingName("");
          setError(null);
        }}
        placeholder="Search or type a machine name"
        disabled={disabled || busy}
        onCreate={startCreate}
        canCreate={(query) => {
          if (createSites.length === 0) {
            return false;
          }
          const match = machines.some(
            (row) => machineNameKey(row.name) === machineNameKey(query),
          );
          return !match || createSites.length > 1;
        }}
        createLabel={(query) => `Add “${normalizeMachineName(query)}”`}
      />
      {pendingName ? (
        <div className="machine-typeahead-create">
          <p className="machine-typeahead-create-title">Add {pendingName}</p>
          <p className="spares-muted text-sm leading-relaxed">
            This machine is saved to a site. Care and quotes can use it without a 3D model.
          </p>
          {role === "staff" ? (
            <MachineSitePicker
              accounts={accounts}
              sites={createSites}
              siteId={siteId}
              onSiteChange={setSiteId}
              allowUnassigned={false}
            />
          ) : (
            <SearchableSelect
              id="machine-typeahead-site"
              label="Site"
              options={createSites.map((site) => ({
                value: site.id,
                label: siteLabel(site, accounts),
              }))}
              value={siteId}
              onChange={setSiteId}
              placeholder="Search sites…"
            />
          )}
          <label className="care-field">
            <span>Maker (optional)</span>
            <input
              value={oem}
              onChange={(event) => setOem(event.target.value)}
              className="spares-field h-11 w-full rounded-2xl border-0 px-3 text-[16px] outline-none"
              placeholder="Fanuc, Kuka…"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !siteId}
              className="btn-primary inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold disabled:opacity-60"
              onClick={() => {
                void createAtSite(pendingName, siteId);
              }}
            >
              {busy ? "Adding…" : "Add machine"}
            </button>
            <button
              type="button"
              className="btn-soft inline-flex h-11 items-center rounded-full px-4 text-sm font-medium"
              onClick={() => {
                setPendingName("");
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="text-sm text-[#f0c4c0]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
