import { requireUser } from "@/lib/auth";
import { error, json } from "@/lib/http";
import { machineFileUrl, toMachineDetail } from "@/lib/machines";
import { getMachine } from "@/lib/store";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await params;
  const machine = await getMachine(id);
  if (!machine) {
    return error("Machine not found", 404);
  }

  return json(toMachineDetail(machine, machineFileUrl(request, machine.id), auth.user.role));
}
