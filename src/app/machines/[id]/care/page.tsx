import { redirect } from "next/navigation";
import { machineTabHref } from "@/lib/machine-context";

export default async function CareOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(machineTabHref(id, "tickets"));
}
