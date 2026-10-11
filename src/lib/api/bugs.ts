import { apiFetch } from "./client";
import { apiFetchList, invalidateListEtag } from "./list-fetch";
import type {
  BugReport,
  BugReportsListResponse,
  SubmitBugReportResponse,
} from "./types";

const BUG_REPORTS_PATH = "/api/bugs";
const BUG_REPORTS_WARM_KEY = "bugs:list";

export function invalidateBugReportsListCache() {
  invalidateListEtag(BUG_REPORTS_PATH);
}

export async function submitBugReport(input: {
  description: string;
  screenshotJpegBase64?: string;
  logText: string;
  path: string;
  userAgent: string;
  userEmail?: string;
  userRole?: string;
  website?: string;
}): Promise<SubmitBugReportResponse> {
  return apiFetch<SubmitBugReportResponse>("/api/bugs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listBugReports(init?: Pick<RequestInit, "signal">): Promise<BugReport[]> {
  const data = await apiFetchList<BugReportsListResponse>(
    BUG_REPORTS_PATH,
    BUG_REPORTS_WARM_KEY,
    init,
  );
  return data.reports ?? [];
}
