"use client";

import { useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { CreateCustomerForm } from "@/components/staff/CreateCustomerForm";
import { CustomersList } from "@/components/staff/CustomersList";

export default function StaffCustomersPage() {
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <RequireAuth role="staff">
      <div className="space-y-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Customers</h1>
          <p className="spares-muted mt-1 text-sm">
            Staff create customer accounts. There is no public registration.
          </p>
        </div>
        <CustomersList reloadKey={reloadKey} />
        <CreateCustomerForm onCreated={() => setReloadKey((key) => key + 1)} />
      </div>
    </RequireAuth>
  );
}
