import { requireRole } from "@/lib/auth";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import {
  createCustomerAccount,
  listCustomerAccounts,
  listSites,
} from "@/lib/store";

export async function GET() {
  const auth = await requireRole("staff");
  if ("error" in auth) {
    return auth.error;
  }
  const accounts = await listCustomerAccounts();
  const sites = await listSites();
  const rows = accounts.map((account) => ({
    ...account,
    siteCount: sites.filter((site) => site.customerId === account.id).length,
  }));
  return json({ accounts: rows });
}

type CreateBody = {
  name?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireRole("staff");
  if ("error" in auth) {
    return auth.error;
  }

  const body = await readJson<CreateBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }

  const name = typeof body.name === "string" ? body.name : "";
  const created = await createCustomerAccount(name);
  if ("error" in created) {
    if (created.error === "taken") {
      return error("A customer with that name already exists", 409);
    }
    return error("Customer name is required", 400);
  }
  return json({ account: { ...created.account, siteCount: 0 } }, 201);
}
