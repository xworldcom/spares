"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { CreatePersonForm } from "@/components/staff/CreatePersonForm";
import { PeopleList } from "@/components/staff/PeopleList";
import { StaffTeamPanel } from "@/components/staff/StaffTeamPanel";

type PeopleTab = "customers" | "staff";

export default function StaffPeoplePage() {
  return (
    <RequireAuth role="staff">
      <Suspense>
        <StaffPeople />
      </Suspense>
    </RequireAuth>
  );
}

function StaffPeople() {
  const router = useRouter();
  const search = useSearchParams();
  const tab: PeopleTab = search.get("tab") === "staff" ? "staff" : "customers";
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);

  function refresh() {
    setReloadKey((key) => key + 1);
  }

  function switchTab(next: PeopleTab) {
    setCreating(false);
    router.replace(next === "staff" ? "/staff/people?tab=staff" : "/staff/people", {
      scroll: false,
    });
  }

  return (
    <div className="catalog-page">
      <div className="catalog-page-intro catalog-page-intro-split">
        <div>
          <h1>People</h1>
          <p>
            {tab === "customers"
              ? "Customer logins — assign one or more sites so they only see machines and tickets for those locations."
              : "Staff logins for your company — full access to machines, Care, and quotes on this install."}
          </p>
        </div>
        {tab === "customers" ? (
          <button
            type="button"
            className="btn-primary catalog-toolbar-action"
            aria-expanded={creating}
            onClick={() => setCreating((open) => !open)}
          >
            {creating ? "Close" : "New person"}
          </button>
        ) : null}
      </div>

      <div
        role="group"
        aria-label="People type"
        className="mb-5 inline-flex rounded-full bg-white/5 p-1"
      >
        <button
          type="button"
          aria-pressed={tab === "customers"}
          onClick={() => switchTab("customers")}
          className={
            tab === "customers"
              ? "rounded-full bg-white/10 px-5 py-2 text-sm font-semibold"
              : "rounded-full px-5 py-2 text-sm font-medium text-[var(--spares-muted)] hover:text-[var(--spares-ink)]"
          }
        >
          Customers
        </button>
        <button
          type="button"
          aria-pressed={tab === "staff"}
          onClick={() => switchTab("staff")}
          className={
            tab === "staff"
              ? "rounded-full bg-white/10 px-5 py-2 text-sm font-semibold"
              : "rounded-full px-5 py-2 text-sm font-medium text-[var(--spares-muted)] hover:text-[var(--spares-ink)]"
          }
        >
          Staff
        </button>
      </div>

      {tab === "customers" ? (
        <>
          {creating ? (
            <CreatePersonForm
              onCreated={() => {
                refresh();
                setCreating(false);
              }}
              onCancel={() => setCreating(false)}
            />
          ) : null}
          <PeopleList reloadKey={reloadKey} />
        </>
      ) : (
        <StaffTeamPanel />
      )}
    </div>
  );
}
