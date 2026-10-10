import { requireTenantStaff } from "@/lib/auth/tenant-scope";
import { error, isErrorResponse, json, readJson, withCatalogConflict } from "@/lib/http";
import type { PartLifecycleStatus } from "@/lib/part-lifecycle";
import {
  filterCatalogRows,
  parsePartLifecycleBulk,
  parsePartLifecyclePatch,
  tallyPartLifecycleStatusCounts,
} from "@/lib/part-lifecycle";
import {
  listMachines,
  listTenantPartLifecycleCatalog,
  upsertTenantPartLifecycle,
} from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Staff part lifecycle catalog (one row per part number per tenant).
 *
 * GET `parts[]` items include `machineIds` and `machineNames` (union of every machine BOM
 * listing that PN). Filters apply to the list only; `statusCounts` reflect the machine
 * filter universe when `machineId` is set.
 */

function parseStatus(value: string | null): PartLifecycleStatus | "all" {
  if (!value || value === "all") {
    return "all";
  }
  if (
    value === "active" ||
    value === "announced" ||
    value === "obsolete" ||
    value === "unknown"
  ) {
    return value;
  }
  return "all";
}

export async function GET(request: Request) {
  const auth = await requireTenantStaff();
  if ("error" in auth) {
    return auth.error;
  }

  const url = new URL(request.url);
  const requestedTenantId = url.searchParams.get("tenantId")?.trim() || undefined;
  if (requestedTenantId && !auth.user.platformOwner && requestedTenantId !== auth.tenantId) {
    return error("Forbidden", 403);
  }
  const tenantId = auth.user.platformOwner ? requestedTenantId ?? auth.tenantId : auth.tenantId;
  if (!tenantId) {
    return error("Choose a host", 400);
  }

  const status = parseStatus(url.searchParams.get("status"));
  const machineId = url.searchParams.get("machineId")?.trim() || undefined;
  const query = url.searchParams.get("q")?.trim() || undefined;

  const [catalogRows, machines] = await Promise.all([
    listTenantPartLifecycleCatalog(tenantId, { machineId, query }),
    listMachines(tenantId),
  ]);
  const statusCounts = tallyPartLifecycleStatusCounts(catalogRows);
  const parts = filterCatalogRows(catalogRows, { status, machineId, query });

  return json({
    tenantId,
    parts,
    statusCounts,
    machines: machines.map((machine) => ({
      id: machine.id,
      name: machine.name,
      siteId: machine.siteId,
    })),
    generatedAt: new Date().toISOString(),
  });
}

type PatchBody = { updates?: unknown; partNumber?: unknown };

async function handlePATCH(request: Request) {
  const auth = await requireTenantStaff();
  if ("error" in auth) {
    return auth.error;
  }

  const body = await readJson<PatchBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }

  const url = new URL(request.url);
  const requestedTenantId = url.searchParams.get("tenantId")?.trim() || undefined;
  if (requestedTenantId && !auth.user.platformOwner && requestedTenantId !== auth.tenantId) {
    return error("Forbidden", 403);
  }
  const tenantId = auth.user.platformOwner ? requestedTenantId ?? auth.tenantId : auth.tenantId;
  if (!tenantId) {
    return error("Choose a host", 400);
  }

  const parsed =
    body.updates != null
      ? parsePartLifecycleBulk(body)
      : parsePartLifecyclePatch(body);
  if ("error" in parsed) {
    return error(parsed.error, 400);
  }

  const updates =
    "updates" in parsed
      ? parsed.updates
      : [{ partNumber: parsed.partNumber, patch: parsed.patch }];

  await upsertTenantPartLifecycle(tenantId, updates, auth.user.email);
  const parts = await listTenantPartLifecycleCatalog(tenantId, {});
  return json({ ok: true, parts });
}

export const PATCH = withCatalogConflict(handlePATCH);
