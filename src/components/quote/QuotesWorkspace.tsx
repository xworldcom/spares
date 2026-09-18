"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { NewQuoteForm } from "@/components/quote/NewQuoteForm";
import { QuotesList } from "@/components/quote/QuotesList";
import type { Role } from "@/types";

export function QuotesWorkspace({ role = "customer" }: { role?: Role }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[32px] font-semibold tracking-tight">Quotes</h1>
          <p className="spares-muted mt-2 text-[15px] leading-relaxed">
            {role === "staff"
              ? "Open a quote for a customer. Type a machine name if it is not listed yet."
              : "Request parts from a machine. Type a name if it is not in the list yet."}
          </p>
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
          onCreated={(href) => {
            setCreating(false);
            router.push(href);
          }}
          onCancel={() => setCreating(false)}
        />
      ) : null}
      <QuotesList role={role} />
    </div>
  );
}
