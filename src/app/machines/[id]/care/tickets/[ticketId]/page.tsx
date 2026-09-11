import { TicketDetail } from "@/components/care/TicketDetail";

export default async function CareTicketPage({
  params,
}: {
  params: Promise<{ id: string; ticketId: string }>;
}) {
  const { id, ticketId } = await params;
  return <TicketDetail machineId={id} ticketId={ticketId} />;
}
