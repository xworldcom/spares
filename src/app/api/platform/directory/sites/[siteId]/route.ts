import { requirePlatformOwner } from "@/lib/auth/tenant-scope";
import { error, json, withCatalogConflict } from "@/lib/http";
import { removePlatformSite } from "@/lib/store";

export const dynamic = "force-dynamic";

async function handleDELETE(
  _request: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const auth = await requirePlatformOwner();
  if ("error" in auth) {
    return auth.error;
  }

  const { siteId } = await params;
  const removed = await removePlatformSite(siteId);
  if ("error" in removed) {
    if (removed.error === "has-machines") {
      return error("Move or remove all machines on this site before deleting it", 409);
    }
    return error("Site not found", 404);
  }
  return json({ ok: true });
}

export const DELETE = withCatalogConflict(handleDELETE);
