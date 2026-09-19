import { apiFetch } from "./client";
import type { ActivityAccount, ActivityEvent } from "@/lib/activity-log-types";

export type ActivityLogResponse = {
  events: ActivityEvent[];
  accounts: ActivityAccount[];
  total: number;
  generatedAt: string;
};

export async function listActivityLog(params?: {
  account?: string;
  tenantId?: string;
  since?: string;
  before?: string;
  limit?: number;
}) {
  const search = new URLSearchParams();
  if (params?.account) {
    search.set("account", params.account);
  }
  if (params?.tenantId) {
    search.set("tenantId", params.tenantId);
  }
  if (params?.since) {
    search.set("since", params.since);
  }
  if (params?.before) {
    search.set("before", params.before);
  }
  if (params?.limit) {
    search.set("limit", String(params.limit));
  }
  const query = search.toString();
  return apiFetch<ActivityLogResponse>(
    query ? `/api/staff/activity?${query}` : "/api/staff/activity",
  );
}
