import { requireTenantStaff } from "@/lib/auth/tenant-scope";
import { error, json } from "@/lib/http";
import { getMachine, listMachineViews } from "@/lib/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireTenantStaff();
  if ("error" in auth) {
    return auth.error;
  }
  const { id } = await params;
  if (!(await getMachine(id, auth.tenantId))) {
    return error("Machine not found", 404);
  }
  return json({ views: await listMachineViews(id, auth.tenantId) });
}
