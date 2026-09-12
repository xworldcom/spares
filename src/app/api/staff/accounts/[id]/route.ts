import { requireRole } from "@/lib/auth";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import {
  deleteCustomerAccount,
  getCustomerAccount,
  listMachines,
  listSites,
  updateCustomerAccount,
} from "@/lib/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("staff");
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await params;
  const account = await getCustomerAccount(id);
  if (!account) {
    return error("Customer not found", 404);
  }
  const [sites, machines] = await Promise.all([listSites(id), listMachines()]);
  const machineCounts = new Map<string, number>();
  for (const machine of machines) {
    if (!machine.siteId) {
      continue;
    }
    machineCounts.set(machine.siteId, (machineCounts.get(machine.siteId) ?? 0) + 1);
  }
  return json({
    account,
    sites: sites.map((site) => ({
      ...site,
      machineCount: machineCounts.get(site.id) ?? 0,
    })),
  });
}

type PatchBody = {
  name?: unknown;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("staff");
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await params;
  const body = await readJson<PatchBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }

  const updated = await updateCustomerAccount(id, {
    ...(typeof body.name === "string" ? { name: body.name } : {}),
  });
  if ("error" in updated) {
    if (updated.error === "taken") {
      return error("A customer with that name already exists", 409);
    }
    if (updated.error === "invalid") {
      return error("Customer name is required", 400);
    }
    return error("Customer not found", 404);
  }
  return json({ account: updated.account });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("staff");
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await params;
  const removed = await deleteCustomerAccount(id);
  if ("error" in removed) {
    if (removed.error === "has-sites") {
      return error("Remove or reassign all sites before deleting this customer", 409);
    }
    return error("Customer not found", 404);
  }
  return json({ ok: true });
}
