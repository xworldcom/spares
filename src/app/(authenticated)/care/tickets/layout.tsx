"use client";

import { useParams } from "next/navigation";
import { TicketsWorkspace } from "@/components/care/TicketsWorkspace";

export default function CareHubTicketsLayout() {
  const params = useParams();
  const ticketId = typeof params.ticketId === "string" ? params.ticketId : undefined;

  return (
    <div className="catalog-page care-page-wide care-tickets-shell">
      <div className="catalog-page-intro">
        <h1>Care</h1>
      </div>
      <div className="care-body">
        <TicketsWorkspace scope="hub" ticketId={ticketId} />
      </div>
    </div>
  );
}
