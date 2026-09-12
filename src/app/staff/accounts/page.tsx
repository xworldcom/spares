"use client";

import { AccountsList } from "@/components/staff/AccountsList";
import { RequireAuth } from "@/components/auth/RequireAuth";

export default function StaffAccountsPage() {
  return (
    <RequireAuth role="staff">
      <div className="catalog-page">
        <div className="catalog-page-intro">
          <h1>Customers</h1>
          <p>Corporate accounts first — open a customer to manage its sites, then assign people and machines.</p>
        </div>
        <AccountsList />
      </div>
    </RequireAuth>
  );
}
