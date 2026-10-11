"use client";

import { useParams } from "next/navigation";
import { TicketsWorkspace } from "@/components/care/TicketsWorkspace";
import type { TicketsListResponse } from "@/lib/api/types";

export function CareHubTicketsClientLayout({
  initialList,
  listEtag,
  children,
}: {
  initialList?: TicketsListResponse | null;
  listEtag?: string | null;
  children: React.ReactNode;
}) {
  const params = useParams();
  const ticketId = typeof params.ticketId === "string" ? params.ticketId : undefined;

  return (
    <div className="catalog-page care-page-wide care-tickets-shell">
      <div className="catalog-page-intro">
        <h1>Care</h1>
      </div>
      <div className="care-body">
        <TicketsWorkspace
          scope="hub"
          ticketId={ticketId}
          initialList={initialList}
          listEtag={listEtag}
        />
      </div>
      {children}
    </div>
  );
}
