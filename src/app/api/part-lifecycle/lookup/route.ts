import { requireUser } from "@/lib/auth";
import { json } from "@/lib/http";
import {
  lifecycleMapForTenant,
  publicLifecycle,
  effectiveLifecycle,
  normalizePartNumber,
} from "@/lib/part-lifecycle";
import { listPartLifecycleRows } from "@/lib/store";
import { userTenantId } from "@/lib/tenant";

export async function GET(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }
  const tenantId = userTenantId(auth.user);
  if (!tenantId) {
    return json({ parts: {} });
  }

  const url = new URL(request.url);
  const numbers = [
    ...url.searchParams.getAll("partNumber"),
    ...(url.searchParams.get("partNumbers")?.split(",") ?? []),
  ]
    .map((value) => normalizePartNumber(value))
    .filter(Boolean);
  const unique = [...new Set(numbers)];
  if (unique.length === 0) {
    return json({ parts: {} });
  }

  const rows = (await listPartLifecycleRows()).filter((row) => row.tenantId === tenantId);
  const map = lifecycleMapForTenant(rows, tenantId);
  const parts: Record<string, ReturnType<typeof publicLifecycle>> = {};
  for (const partNumber of unique) {
    const fields = effectiveLifecycle(map.get(partNumber));
    if (auth.user.role === "staff") {
      parts[partNumber] = fields;
    } else {
      parts[partNumber] = publicLifecycle(fields) ?? { status: fields.status };
    }
  }
  return json({ parts });
}
