"use client";

import { useSearchParams } from "next/navigation";
import { QUOTES_Q_QUERY } from "@/lib/quotes-list-filter";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { NewQuoteForm } from "@/components/quote/NewQuoteForm";
import { QuotesList } from "@/components/quote/QuotesList";
import { DocumentTitle } from "@/components/nav/DocumentTitle";
import { useMachineName } from "@/components/nav/useMachineName";
import { WorkListScopeBar } from "@/components/nav/WorkListScopeBar";
import { workListTitle } from "@/lib/work-list-scope";
import { workListMachineIdFromSearchParam, WORK_LIST_MACHINE_QUERY } from "@/lib/work-list-scope";
import type { QuotesListResponse } from "@/lib/api/types";
import type { Role } from "@/types";

export function MachineQuotesWorkspace({
  machineId,
  initialList,
}: {
  machineId: string;
  initialList?: QuotesListResponse | null;
}) {
  const { user } = useAuth();
  if (!user) {
    return null;
  }
  return (
    <QuotesWorkspace
      role={user.role === "staff" ? "staff" : "customer"}
      machineId={machineId}
      initialList={initialList}
    />
  );
}

export function QuotesWorkspace({
  role = "customer",
  machineId,
  initialList,
}: {
  role?: Role;
  machineId?: string;
  initialList?: QuotesListResponse | null;
}) {
  const searchParams = useSearchParams();
  const hubSearchQuery = searchParams.get(QUOTES_Q_QUERY) ?? "";
  const [creating, setCreating] = useState(false);
  const scoped = Boolean(machineId);
  const hubMachineId =
    machineId ??
    workListMachineIdFromSearchParam(searchParams.get(WORK_LIST_MACHINE_QUERY));
  const machineName = useMachineName(machineId ?? hubMachineId ?? null);
  const pageTitle = workListTitle(
    "quotes",
    scoped || hubMachineId ? machineName : null,
    scoped || Boolean(hubMachineId),
  );
  const hubListTitle = (() => {
    const q = hubSearchQuery.trim();
    return q ? `${pageTitle} · Search` : pageTitle;
  })();

  return (
    <div className={scoped ? "space-y-4" : "catalog-page"}>
      {machineId ? (
        <DocumentTitle title={pageTitle} />
      ) : (
        <DocumentTitle title={hubListTitle} />
      )}
      <div className={scoped ? undefined : "catalog-page-intro"}>
        <WorkListScopeBar
          kind="quotes"
          machineId={machineId}
          hubMachineId={scoped ? undefined : hubMachineId}
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
      <QuotesList role={role} machineId={hubMachineId} initialList={initialList} />
    </div>
  );
}
