"use client";

import { useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { CreateCustomerForm } from "@/components/staff/CreateCustomerForm";
import { CustomersList } from "@/components/staff/CustomersList";
import { SitesPanel } from "@/components/staff/SitesPanel";

export default function StaffCustomersPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);

  function refresh() {
    setReloadKey((key) => key + 1);
  }

  return (
    <RequireAuth role="staff">
      <div className="catalog-page">
        <div className="catalog-page-intro catalog-page-intro-split">
          <div>
            <h1>Customers</h1>
            <p>Name, contact, and plant — give each person a site, or all plants at their company.</p>
          </div>
          <button
            type="button"
            className="btn-primary catalog-toolbar-action"
            aria-expanded={creating}
            onClick={() => setCreating((open) => !open)}
          >
            {creating ? "Close" : "New customer"}
          </button>
        </div>
        {creating ? (
          <CreateCustomerForm
            onCreated={() => {
              refresh();
              setCreating(false);
            }}
            onCancel={() => setCreating(false)}
          />
        ) : null}
        <CustomersList reloadKey={reloadKey} />
        <SitesPanel reloadKey={reloadKey} onChange={refresh} />
      </div>
    </RequireAuth>
  );
}
