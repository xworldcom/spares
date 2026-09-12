"use client";

import { useParams } from "next/navigation";
import { TicketsWorkspace } from "@/components/care/TicketsWorkspace";

export default function CareHubTicketsLayout() {
  const params = useParams();
  const ticketId = typeof params.ticketId === "string" ? params.ticketId : undefined;
  return <TicketsWorkspace scope="hub" ticketId={ticketId} />;
}
