import { redirect } from "next/navigation";

export default async function CareUsagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/machines/${id}/care/service`);
}
