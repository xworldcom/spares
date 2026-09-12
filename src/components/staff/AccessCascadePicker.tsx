"use client";

import { useMemo, useState } from "react";
import {
  grantFromUser,
  isMachineGranted,
  isSiteFullyGranted,
  isSiteIndeterminate,
  machinesAtSite,
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

  const [customerId, setCustomerId] = useState<string>(() => activeAccounts[0]?.id ?? "");

  const selectedCustomerId =
    activeAccounts.some((row) => row.id === customerId)
      ? customerId
      : (activeAccounts[0]?.id ?? "");

  const customerSites = useMemo(
    () => sitesForCustomer(selectedCustomerId, sites),
    [selectedCustomerId, sites],
  );

  const selectedSiteIds = useMemo(() => {
    const fromGrant = grant.siteIds.filter((siteId) =>
      customerSites.some((site) => site.id === siteId),
    );
    const partialSites = customerSites
      .filter((site) =>
        machinesAtSite(site.id, machines).some((row) => grant.machineIds.includes(row.id)),
      )
      .map((site) => site.id);
    return new Set([...fromGrant, ...partialSites]);
  }, [customerSites, grant.machineIds, grant.siteIds]);

  const visibleMachines = useMemo(() => {
    return customerSites
      .filter((site) => selectedSiteIds.has(site.id))
      .flatMap((site) =>
        machines
          .filter((machine) => machine.siteId === site.id)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
  }, [customerSites, machines, selectedSiteIds]);

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
          <p className="access-cascade-step-label">Customer</p>
          <ul className="access-cascade-options">
            {activeAccounts.map((account) => (
              <li key={account.id}>
                <label className="access-cascade-option">
                  <input
                    type="radio"
                    name={`access-customer-${legend ?? "picker"}`}
                    checked={selectedCustomerId === account.id}
                    onChange={() => setCustomerId(account.id)}
                  />
                  <span>{account.name}</span>
                </label>
              </li>
            ))}
          </ul>
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
          {selectedSiteIds.size === 0 ? (
            <p className="access-cascade-empty">Select one or more sites.</p>
          ) : visibleMachines.length === 0 ? (
            <p className="access-cascade-empty">No machines at selected sites.</p>
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
