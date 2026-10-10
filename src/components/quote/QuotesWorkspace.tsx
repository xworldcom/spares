"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { NewQuoteForm } from "@/components/quote/NewQuoteForm";
import { QuotesList } from "@/components/quote/QuotesList";
import { WorkListScopeBar } from "@/components/nav/WorkListScopeBar";
import { workListMachineIdFromSearchParam, WORK_LIST_MACHINE_QUERY } from "@/lib/work-list-scope";
import type { Role } from "@/types";

export function MachineQuotesWorkspace({ machineId }: { machineId: string }) {
  const { user } = useAuth();
  if (!user) {
    return null;
  }
  return (
    <QuotesWorkspace
      role={user.role === "staff" ? "staff" : "customer"}
      machineId={machineId}
    />
  );
}

export function QuotesWorkspace({
  role = "customer",
  machineId,
}: {
  role?: Role;
  machineId?: string;
}) {
  const searchParams = useSearchParams();
  const [creating, setCreating] = useState(false);
  const scoped = Boolean(machineId);
  const hubMachineId =
    machineId ??
    workListMachineIdFromSearchParam(searchParams.get(WORK_LIST_MACHINE_QUERY));

  return (
    <div className={scoped ? "space-y-4" : "catalog-page"}>
      <div className={scoped ? undefined : "catalog-page-intro"}>
        <WorkListScopeBar
          kind="quotes"
          machineId={machineId}
          role={role}
          headingLevel={scoped ? "h2" : "h1"}
          action={
            <button
              type="button"
              className="btn-primary inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold"
              aria-expanded={creating}
              onClick={() => setCreating((open) => !open)}
            >
              {creating ? "Close" : "New quote"}
            </button>
          }
        />
      </div>
      {creating ? (
        <NewQuoteForm
          role={role}
          initialMachineId={machineId}
          onCreated={() => {
            setCreating(false);
          }}
          onCancel={() => setCreating(false)}
        />
      ) : null}
      <QuotesList role={role} machineId={hubMachineId} />
    </div>
  );
}
