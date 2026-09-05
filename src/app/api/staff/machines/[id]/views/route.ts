import { requireRole } from "@/lib/auth";
import { error, json } from "@/lib/http";
import { getMachine, listMachineViews } from "@/lib/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("staff");
  if ("error" in auth) {
    return auth.error;
  }
  const { id } = await params;
  if (!(await getMachine(id))) {
    return error("Machine not found", 404);
  }
  return json({ views: await listMachineViews(id) });
}
