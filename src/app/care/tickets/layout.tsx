"use client";

import { useParams } from "next/navigation";
import { TicketsWorkspace } from "@/components/care/TicketsWorkspace";

export default function CareHubTicketsLayout() {
  const params = useParams();
  const ticketId = typeof params.ticketId === "string" ? params.ticketId : undefined;

  return (
    <div className="catalog-page care-page-wide">
      <div className="catalog-page-intro">
        <h1>Care</h1>
        <p>
          Open tickets across your plant. Open a machine when you need the model, a
          quote, or manuals.
        </p>
      </div>
      <div className="care-body">
        <TicketsWorkspace scope="hub" ticketId={ticketId} />
      </div>
    </div>
  );
}
