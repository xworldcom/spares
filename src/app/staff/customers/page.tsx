"use client";

import { useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { CreateCustomerForm } from "@/components/staff/CreateCustomerForm";
import { CustomersList } from "@/components/staff/CustomersList";
import { SitesPanel } from "@/components/staff/SitesPanel";

export default function StaffCustomersPage() {
  const [reloadKey, setReloadKey] = useState(0);

  function refresh() {
    setReloadKey((key) => key + 1);
  }

  return (
    <RequireAuth role="staff">
      <div className="space-y-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Customers</h1>
          <p className="spares-muted mt-1 text-sm">
            Give each person a plant. They only see machines at that plant.
          </p>
        </div>
        <SitesPanel reloadKey={reloadKey} onChange={refresh} />
        <CustomersList reloadKey={reloadKey} />
        <CreateCustomerForm onCreated={refresh} />
      </div>
    </RequireAuth>
  );
}
