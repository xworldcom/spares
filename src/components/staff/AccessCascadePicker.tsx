"use client";

import { useEffect, useMemo, useState } from "react";
import { CustomerPicker } from "@/components/staff/CustomerPicker";
import {
  customerIdForGrant,
  grantFromUser,
  isMachineGranted,
  isSiteFullyGranted,
  isSiteIndeterminate,
  machinesForCustomer,
  normalizeAccessGrant,
  sitesForCustomer,
  toggleMachineGrant,
  toggleSiteGrant,
  type AccessGrant,
} from "@/lib/access";
import type { CustomerAccount, MachineSummary, Site } from "@/lib/api/types";

export function AccessCascadePicker({
  grant,
  onChange,
  sites,
  accounts,
  machines,
  disabled = false,
  legend,
}: {
  grant: AccessGrant;
  onChange: (next: AccessGrant) => void;
  sites: readonly Site[];
  accounts: readonly CustomerAccount[];
  machines: readonly MachineSummary[];
  disabled?: boolean;
  legend?: string;
}) {
  const activeAccounts = useMemo(
    () => accounts.filter((row) => !row.deletedAt).sort((a, b) => a.name.localeCompare(b.name)),
    [accounts],
  );

  const grantCustomerId = useMemo(
    () => customerIdForGrant(grant, sites, machines, activeAccounts),
    [grant, sites, machines, activeAccounts],
  );

  const [customerId, setCustomerId] = useState(grantCustomerId);

  useEffect(() => {
    setCustomerId(grantCustomerId);
  }, [grantCustomerId]);

  const selectedCustomerId = activeAccounts.some((row) => row.id === customerId)
    ? customerId
    : grantCustomerId;

  const customerSites = useMemo(
    () => sitesForCustomer(selectedCustomerId, sites),
    [selectedCustomerId, sites],
  );

  const visibleMachines = useMemo(
    () => machinesForCustomer(selectedCustomerId, sites, machines),
    [machines, selectedCustomerId, sites],
  );

  function updateGrant(next: AccessGrant) {
    onChange(normalizeAccessGrant(next, machines));
  }

  function toggleSite(siteId: string) {
    updateGrant(toggleSiteGrant(grant, siteId, machines));
  }

  function toggleMachine(machine: Pick<MachineSummary, "id" | "name" | "siteId">) {
    updateGrant(toggleMachineGrant(grant, machine, machines));
  }

  return (
    <fieldset className="access-cascade" disabled={disabled}>
      {legend ? <legend className="sr-only">{legend}</legend> : null}
      <div className="access-cascade-columns">
        <div className="access-cascade-step">
          <CustomerPicker
            id={`access-customer-${legend ?? "picker"}`}
            accounts={activeAccounts}
            value={selectedCustomerId}
            onChange={setCustomerId}
            disabled={disabled}
            allowEmpty
            emptyLabel="Select customer"
            placeholder="Search customers…"
          />
        </div>
        <div className="access-cascade-step">
          <p className="access-cascade-step-label">Sites</p>
          {customerSites.length === 0 ? (
            <p className="access-cascade-empty">No sites for this customer.</p>
          ) : (
            <ul className="access-cascade-options">
              {customerSites.map((site) => {
                const checked = isSiteFullyGranted(grant, site.id, machines);
                const indeterminate = isSiteIndeterminate(grant, site.id, machines);
                return (
                  <li key={site.id}>
                    <label className="access-cascade-option">
                      <input
                        type="checkbox"
                        checked={checked}
                        ref={(node) => {
                          if (node) {
                            node.indeterminate = indeterminate;
                          }
                        }}
                        onChange={() => toggleSite(site.id)}
                      />
                      <span>{site.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="access-cascade-step">
          <p className="access-cascade-step-label">Machines</p>
          {!selectedCustomerId ? (
            <p className="access-cascade-empty">Pick a customer to see machines.</p>
          ) : visibleMachines.length === 0 ? (
            <p className="access-cascade-empty">No machines for this customer.</p>
          ) : (
            <ul className="access-cascade-options">
              {visibleMachines.map((machine) => (
                <li key={machine.id}>
                  <label className="access-cascade-option">
                    <input
                      type="checkbox"
                      checked={isMachineGranted(grant, machine)}
                      onChange={() => toggleMachine(machine)}
                    />
                    <span>{machine.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </fieldset>
  );
}

export function grantFromPublicUser(user: {
  siteIds?: string[];
  machineIds?: string[];
}): AccessGrant {
  return grantFromUser(user);
}
