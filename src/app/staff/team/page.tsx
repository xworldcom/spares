"use client";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { StaffTeamPanel } from "@/components/staff/StaffTeamPanel";

export default function StaffTeamPage() {
  return (
    <RequireAuth role="staff">
      <div className="catalog-page">
        <div className="catalog-page-intro">
          <h1>Team</h1>
          <p>
            Staff logins for your company. Customer people are managed on{" "}
            <a href="/staff/people" className="underline">
              People
            </a>
            .
          </p>
        </div>
        <StaffTeamPanel />
      </div>
    </RequireAuth>
  );
}
