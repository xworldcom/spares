import { CareOverviewPanel } from "@/components/care/CareOverviewPanel";

export default async function CareOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CareOverviewPanel machineId={id} />;
}
