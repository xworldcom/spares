import { requirePlatformOwner } from "@/lib/auth/tenant-scope";
import { error, isErrorResponse, json, readJson, withCatalogConflict } from "@/lib/http";
import {
  getPlatformDirectoryCustomer,
  mutatePlatformDirectoryCustomer,
  removePlatformCustomerAccount,
} from "@/lib/store";

export const dynamic = "force-dynamic";

type PatchBody = {
  name?: unknown;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ customerId: string }> },
) {
  const auth = await requirePlatformOwner();
  if ("error" in auth) {
    return auth.error;
  }

  const { customerId } = await params;
  const detail = await getPlatformDirectoryCustomer(customerId);
  if ("error" in detail) {
    return error("Customer not found", 404);
  }
  return json(detail);
}

async function handlePATCH(
  request: Request,
  { params }: { params: Promise<{ customerId: string }> },
) {
  const auth = await requirePlatformOwner();
  if ("error" in auth) {
    return auth.error;
  }

  const { customerId } = await params;
  const body = await readJson<PatchBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }

  const updated = await mutatePlatformDirectoryCustomer(customerId, {
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

async function handleDELETE(
  _request: Request,
  { params }: { params: Promise<{ customerId: string }> },
) {
  const auth = await requirePlatformOwner();
  if ("error" in auth) {
    return auth.error;
  }

  const { customerId } = await params;
  const removed = await removePlatformCustomerAccount(customerId);
  if ("error" in removed) {
    if (removed.error === "has-sites") {
      return error("Remove or reassign all sites before deleting this customer", 409);
    }
    return error("Customer not found", 404);
  }
  return json({ ok: true });
}

export const PATCH = withCatalogConflict(handlePATCH);
export const DELETE = withCatalogConflict(handleDELETE);
