"use client";

import { use } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { CustomerSitesManager } from "@/components/staff/CustomerSitesManager";

export default function StaffAccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <RequireAuth role="staff">
      <div className="catalog-page">
        <CustomerSitesManager customerId={id} />
      </div>
    </RequireAuth>
  );
}
