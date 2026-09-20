"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { NewQuoteForm } from "@/components/quote/NewQuoteForm";
import { QuotesList } from "@/components/quote/QuotesList";
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
        <div>
          {scoped ? (
            <>
              <h2 className="text-[19px] font-semibold tracking-tight">Quotes</h2>
              <p className="spares-muted mt-1 text-sm leading-relaxed">
                Parts requests for this machine.
              </p>
            </>
          ) : (
            <>
              <h1>Quotes</h1>
              <p>
                {role === "staff"
                  ? "Open work across machines. Jump into a machine when you need the model or tickets."
                  : "Request parts from a machine. Open the machine to pick from the model."}
              </p>
            </>
          )}
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
