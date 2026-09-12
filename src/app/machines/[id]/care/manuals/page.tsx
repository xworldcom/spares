import { ManualsPanel } from "@/components/care/ManualsPanel";

export default async function CareManualsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ManualsPanel machineId={id} />;
}
