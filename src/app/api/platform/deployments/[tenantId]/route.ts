import { requirePlatformOwner } from "@/lib/auth/tenant-scope";
import { hostTicketMailbox } from "@/lib/care-ticket-email";
import { error, json } from "@/lib/http";
import { getPlatformDeployment } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, context: Params) {
  const auth = await requirePlatformOwner();
  if ("error" in auth) {
    return auth.error;
  }
  const { tenantId } = await context.params;
  const result = await getPlatformDeployment(tenantId);
  if ("error" in result) {
    return error("Tenant not found", 404);
  }
  return json({
    ...result,
    ticketMailbox: hostTicketMailbox(result.deployment.tenant),
  });
}
