import { TicketsWorkspace } from "@/components/care/TicketsWorkspace";

export default async function CareTicketsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TicketsWorkspace scope="machine" machineId={id} />;
}
