"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { NewQuoteForm } from "@/components/quote/NewQuoteForm";
import { QuotesList } from "@/components/quote/QuotesList";
import { WorkListScopeBar } from "@/components/nav/WorkListScopeBar";
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
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const scoped = Boolean(machineId);

  return (
    <div className={scoped ? "space-y-4" : "catalog-page"}>
      <div
        className={
          scoped
            ? "tickets-workspace-toolbar"
            : "catalog-page-intro catalog-page-intro-split"
        }
      >
        <div className="min-w-0 flex-1">
          <WorkListScopeBar
            kind="quotes"
            machineId={machineId}
            role={role}
            headingLevel={scoped ? "h2" : "h1"}
            lede={
              scoped
                ? "Only this machine."
                : role === "staff"
                  ? "Every quote in your queue. Open one machine to see its model and tickets."
                  : "Every parts request across your plant. Open one machine to pick from the model."
            }
          />
        </div>
        <button
          type="button"
          className="btn-primary inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold"
          aria-expanded={creating}
          onClick={() => setCreating((open) => !open)}
        >
          {creating ? "Close" : "New quote"}
        </button>
      </div>
      {creating ? (
        <NewQuoteForm
          role={role}
          initialMachineId={machineId}
          onCreated={(href) => {
            setCreating(false);
            router.push(href);
          }}
          onCancel={() => setCreating(false)}
        />
      ) : null}
      <QuotesList role={role} machineId={machineId} />
    </div>
  );
}
