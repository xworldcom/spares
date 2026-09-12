"use client";

import { useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { CreatePersonForm } from "@/components/staff/CreatePersonForm";
import { PeopleList } from "@/components/staff/PeopleList";

export default function StaffPeoplePage() {
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
            <h1>People</h1>
            <p>Customer logins — assign one or more sites so they only see machines and tickets for those locations.</p>
          </div>
          <button
            type="button"
            className="btn-primary catalog-toolbar-action"
            aria-expanded={creating}
            onClick={() => setCreating((open) => !open)}
          >
            {creating ? "Close" : "New person"}
          </button>
        </div>
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
      </div>
    </RequireAuth>
  );
}
