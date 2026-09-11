import { TicketsWorkspace } from "@/components/care/TicketsWorkspace";

export default async function CareHubTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  return <TicketsWorkspace scope="hub" ticketId={ticketId} />;
}
