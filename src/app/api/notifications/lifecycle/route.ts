import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth/tenant-scope";
import { error, isErrorResponse, json, readJson, withCatalogConflict } from "@/lib/http";
import { etagMatches } from "@/lib/record-etag";
import { toPublicLifecycleNotification } from "@/lib/lifecycle-notifications";
import {
  countUserLifecycleNotificationsUnread,
  getUserLifecycleNotificationsBundle,
  markAllUserLifecycleNotificationsRead,
  markUserLifecycleNotificationRead,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireTenantUser();
  if ("error" in auth) {
    return auth.error;
  }
  const tenantId = auth.tenantId;
  if (!tenantId) {
    return error("Choose a host", 400);
  }
  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unread") === "1";
  const { notifications: rows, unreadCount } = await getUserLifecycleNotificationsBundle(
    tenantId,
    auth.user.id,
    { unreadOnly },
  );
  const generatedAt = new Date().toISOString();
  const etag = `W/"lifecycle:${unreadCount}:${rows.length}:${rows[0]?.id ?? "none"}"`;
  if (etagMatches(request, etag)) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": "private, no-store" },
    });
  }
  return NextResponse.json(
    {
      notifications: rows.map(toPublicLifecycleNotification),
      unreadCount,
      generatedAt,
    },
    { status: 200, headers: { ETag: etag, "Cache-Control": "private, no-store" } },
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
