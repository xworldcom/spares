"use client";

import { useParams } from "next/navigation";
import { TicketsWorkspace } from "@/components/care/TicketsWorkspace";

export default function MachineCareTicketsLayout() {
  const params = useParams();
  const machineId = typeof params.id === "string" ? params.id : "";
  const ticketId = typeof params.ticketId === "string" ? params.ticketId : undefined;
  return <TicketsWorkspace scope="machine" machineId={machineId} ticketId={ticketId} />;
}
