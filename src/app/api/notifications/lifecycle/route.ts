import type { NextRequest } from "next/server";
import { requireTenantUser } from "@/lib/auth/tenant-scope";
import { respondDerivedList } from "@/lib/derived-list-cache";
import { error, isErrorResponse, json, readJson, withCatalogConflict } from "@/lib/http";
import { buildLifecycleNotificationsPayload } from "@/lib/lifecycle-notifications-list-payload";
import { lifecycleNotificationsScopeKey } from "@/lib/list-scope";
import {
  countUserLifecycleNotificationsUnread,
  markAllUserLifecycleNotificationsRead,
  markUserLifecycleNotificationRead,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireTenantUser();
  if ("error" in auth) {
    return auth.error;
  }
  const tenantId = auth.tenantId;
  if (!tenantId) {
    return error("Choose a host", 400);
  }
  const url = request.nextUrl;
  const unreadOnly = url.searchParams.get("unread") === "1";
  const scope = lifecycleNotificationsScopeKey(tenantId, auth.user.id, unreadOnly);
  return respondDerivedList(request, scope, () =>
    buildLifecycleNotificationsPayload(tenantId, auth.user.id, { unreadOnly }),
  );
}

type PatchBody = { id?: unknown; markAll?: unknown };

async function handlePATCH(request: Request) {
  const auth = await requireTenantUser();
  if ("error" in auth) {
    return auth.error;
  }
  const tenantId = auth.tenantId;
  if (!tenantId) {
    return error("Choose a host", 400);
  }
  const body = await readJson<PatchBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }
  if (body.markAll === true) {
    await markAllUserLifecycleNotificationsRead(tenantId, auth.user.id);
    const unreadCount = await countUserLifecycleNotificationsUnread(tenantId, auth.user.id);
    return json({ ok: true, unreadCount });
  }
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) {
    return error("id or markAll required", 400);
  }
  const result = await markUserLifecycleNotificationRead(tenantId, auth.user.id, id);
  if (!result.ok) {
    return error("Not found", 404);
  }
  const unreadCount = await countUserLifecycleNotificationsUnread(tenantId, auth.user.id);
  return json({ ok: true, unreadCount });
}

export const PATCH = withCatalogConflict(handlePATCH);
