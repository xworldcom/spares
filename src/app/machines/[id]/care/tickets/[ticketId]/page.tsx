import { TicketsWorkspace } from "@/components/care/TicketsWorkspace";

export default async function CareTicketPage({
  params,
}: {
  params: Promise<{ id: string; ticketId: string }>;
}) {
  const { id, ticketId } = await params;
  return <TicketsWorkspace scope="machine" machineId={id} ticketId={ticketId} />;
}
