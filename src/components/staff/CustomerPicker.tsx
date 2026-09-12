"use client";

import { useMemo } from "react";
import { SearchableSelect } from "@/components/staff/SearchableSelect";
import type { CustomerAccount } from "@/lib/api/types";

export function CustomerPicker({
  id,
  label = "Customer",
  accounts,
  value,
  onChange,
  disabled = false,
  placeholder = "Search customers…",
  allowEmpty = false,
  emptyLabel = "Select customer",
}: {
  id?: string;
  label?: string;
  accounts: readonly CustomerAccount[];
  value: string;
  onChange: (customerId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const options = useMemo(
    () =>
      accounts
        .filter((row) => !row.deletedAt)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((row) => ({ value: row.id, label: row.name })),
    [accounts],
  );

  return (
    <SearchableSelect
      id={id}
      label={label}
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      allowEmpty={allowEmpty}
      emptyLabel={emptyLabel}
    />
  );
}
