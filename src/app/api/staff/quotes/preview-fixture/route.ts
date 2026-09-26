import { requireTenantStaff } from "@/lib/auth/tenant-scope";
import { staffCustomerUsers } from "@/lib/care-http";
import { error, json } from "@/lib/http";
import { isSeedAllowed } from "@/lib/production-env";
import { toPublicQuote } from "@/lib/quotes";
import { ensurePreviewQaQuoteFixture, getMachine, listMachines } from "@/lib/store";

export async function POST() {
  const auth = await requireTenantStaff();
  if ("error" in auth) {
    return auth.error;
  }

  if (!isSeedAllowed()) {
    return error(
      "Preview QA quote fixtures are disabled in this environment (SPARES_ALLOW_SEED is not enabled).",
      403,
    );
  }

  const result = await ensurePreviewQaQuoteFixture(auth.tenantId);
  if (result.status === "disabled") {
    return error(
      "Preview QA quote fixtures are disabled in this environment (SPARES_ALLOW_SEED is not enabled).",
      403,
    );
  }
  if (result.status === "no_machine") {
    return error(
      "No machine with parts is available on this tenant. Wait for catalog heal or upload a pack first.",
      404,
    );
  }
  if (result.status === "no_customer") {
    return error(
      "No customer login exists on this tenant. Create one under People, or use Preview demo seeds.",
      404,
    );
  }

  const [machine, machines] = await Promise.all([
    getMachine(result.quote.machineId, auth.tenantId),
    listMachines(auth.tenantId),
  ]);
  const names = new Map(machines.map((row) => [row.id, row.name]));
  const customerUsers = await staffCustomerUsers(auth.tenantId);

  return json({
    status: result.status,
    quote: toPublicQuote(result.quote, auth.user, machine?.name ?? names.get(result.quote.machineId), {
      customerUsers,
    }),
  });
}
