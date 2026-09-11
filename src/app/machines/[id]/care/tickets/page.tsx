import { TicketsPanel } from "@/components/care/TicketsPanel";

export default async function CareTicketsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TicketsPanel machineId={id} />;
}
