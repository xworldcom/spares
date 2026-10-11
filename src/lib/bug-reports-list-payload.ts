import type { BugReportsListResponse } from "@/lib/api/types";
import { listBugReports } from "@/lib/store";

export async function buildBugReportsListPayload(tenantId: string): Promise<BugReportsListResponse> {
  const reports = await listBugReports(tenantId);
  return {
    reports: reports.map((report) => ({
      id: report.id,
      description: report.description,
      createdAt: report.createdAt,
      path: report.path,
      userAgent: report.userAgent,
      userEmail: report.userEmail,
      userRole: report.userRole,
      logText: report.logText,
      githubIssueUrl: report.githubIssueUrl,
      delivery: report.delivery,
      screenshotUrl: report.screenshotFileName
        ? `/api/bugs/${report.id}/screenshot`
        : undefined,
    })),
  };
}
