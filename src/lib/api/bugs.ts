import { apiFetch } from "./client";
import type {
  BugReport,
  BugReportsListResponse,
  SubmitBugReportResponse,
} from "./types";

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

export async function listBugReports(): Promise<BugReport[]> {
  const data = await apiFetch<BugReportsListResponse>("/api/bugs");
  return data.reports ?? [];
}
