"use client";

import { useEffect, useMemo, useState } from "react";
import { CustomerPicker } from "@/components/staff/CustomerPicker";
import { SearchableSelect } from "@/components/staff/SearchableSelect";
import { sitesForCustomer } from "@/lib/access";
import type { CustomerAccount, Site } from "@/lib/api/types";

export function MachineSitePicker({
  accounts,
  sites,
  siteId,
  onSiteChange,
  disabled = false,
  allowUnassigned = true,
  lockAccount = false,
}: {
  accounts: readonly CustomerAccount[];
  sites: readonly Site[];
  siteId: string;
  onSiteChange: (siteId: string) => void;
  disabled?: boolean;
  allowUnassigned?: boolean;
  lockAccount?: boolean;
}) {
  const activeAccounts = useMemo(
    () => accounts.filter((row) => !row.deletedAt),
    [accounts],
  );

  const siteCustomerId = useMemo(() => {
    if (!siteId) {
      return "";
    }
    return sites.find((row) => row.id === siteId && !row.deletedAt)?.customerId ?? "";
  }, [siteId, sites]);

  const [customerId, setCustomerId] = useState(siteCustomerId);

  useEffect(() => {
    if (siteCustomerId) {
      setCustomerId(siteCustomerId);
    }
  }, [siteCustomerId]);

  const selectedCustomerId = activeAccounts.some((row) => row.id === customerId)
    ? customerId
    : siteCustomerId;

  const customerSites = useMemo(
    () => sitesForCustomer(selectedCustomerId, sites),
    [selectedCustomerId, sites],
  );

  const siteOptions = useMemo(
    () =>
      customerSites.map((site) => ({
        value: site.id,
        label: site.name,
      })),
    [customerSites],
  );

  function onCustomerChange(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    if (siteId) {
      const current = sites.find((row) => row.id === siteId);
      if (current?.customerId !== nextCustomerId) {
        onSiteChange("");
      }
    }
  }

  const lockedAccount = lockAccount
    ? activeAccounts.find((row) => row.id === selectedCustomerId) ?? activeAccounts[0]
    : undefined;

  return (
    <div className="machine-site-picker">
      {lockAccount && lockedAccount ? (
        <p className="care-field">
          <span>Customer</span>
          <span className="spares-field flex h-11 items-center rounded-2xl px-3 text-[16px]">
            {lockedAccount.name}
          </span>
        </p>
      ) : (
        <CustomerPicker
          id="machine-site-customer"
          accounts={accounts}
          value={selectedCustomerId}
          onChange={onCustomerChange}
          disabled={disabled}
          allowEmpty={allowUnassigned}
          emptyLabel="No customer"
          placeholder="Search customers…"
        />
      )}
      <SearchableSelect
        id="machine-site-site"
        label="Site"
        options={siteOptions}
        value={selectedCustomerId && siteId ? siteId : ""}
        onChange={onSiteChange}
        placeholder={
          selectedCustomerId ? "Search sites…" : "Pick a customer first"
        }
        disabled={disabled || !selectedCustomerId}
        allowEmpty={allowUnassigned}
        emptyLabel="Unassigned — staff only"
      />
    </div>
  );
}
