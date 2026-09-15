import { getCurrentUser } from "@/lib/auth";
import { requireTenantStaff } from "@/lib/auth/tenant-scope";
import { DEFAULT_TENANT_ID, effectiveTenantId } from "@/lib/tenant";
import {
  bugReportUserLabel,
  parseJpegBase64,
  stripSecrets,
} from "@/lib/bug-report/format";
import { createGithubBugIssue, githubToken } from "@/lib/github/bugs";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { allowRateLimit, clientIp } from "@/lib/rate-limit";
import {
  attachBugReportGithubIssue,
  createBugReport,
  listBugReports,
} from "@/lib/store";

type CreateBugBody = {
  description?: unknown;
  screenshotJpegBase64?: unknown;
  logText?: unknown;
  path?: unknown;
  userAgent?: unknown;
  userEmail?: unknown;
  userRole?: unknown;
};

const MAX_DESCRIPTION = 8000;
const MAX_LOG = 32_000;
const MAX_SCREENSHOT = Math.floor(2 * 1024 * 1024);

function clip(value: string, max: number) {
  return value.length > max ? value.slice(0, max) : value;
}

export async function GET() {
  const auth = await requireTenantStaff();
  if ("error" in auth) {
    return auth.error;
  }

  const reports = await listBugReports(auth.tenantId);
  return json({
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
  });
}

export async function POST(request: Request) {
  if (!allowRateLimit(`bugs:${clientIp(request)}`, 5, 60_000)) {
    return error("Too many bug reports. Try again in a minute.", 429);
  }

  const body = await readJson<CreateBugBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }

  const description =
    typeof body.description === "string" ? stripSecrets(body.description.trim()) : "";
  if (!description) {
    return error("description is required", 400);
  }

  const sessionUser = await getCurrentUser();
  // Ignore client-supplied identity. Spoofing staff/customer on an open POST
  // would otherwise land in GitHub issues and the staff inbox.
  const userEmail = sessionUser?.email;
  const userRole = sessionUser?.role;
  const pathValue =
    typeof body.path === "string" && body.path.trim() ? body.path.trim() : "/";
  const userAgent =
    typeof body.userAgent === "string" && body.userAgent.trim()
      ? body.userAgent.trim()
      : request.headers.get("user-agent") || "";
  const logText =
    typeof body.logText === "string" ? stripSecrets(body.logText) : "";
  const screenshot =
    typeof body.screenshotJpegBase64 === "string"
      ? parseJpegBase64(body.screenshotJpegBase64)
      : null;
  const screenshotBytes =
    screenshot && screenshot.length <= MAX_SCREENSHOT ? screenshot : undefined;

  const record = {
    description: clip(description, MAX_DESCRIPTION),
    path: clip(stripSecrets(pathValue), 500),
    userAgent: clip(stripSecrets(userAgent), 500),
    userEmail,
    userRole,
    logText: clip(logText, MAX_LOG),
    screenshot: screenshotBytes,
  };

  const bugTenantId = sessionUser
    ? effectiveTenantId(sessionUser)
    : DEFAULT_TENANT_ID;

  let stored: Awaited<ReturnType<typeof createBugReport>> | null = null;
  try {
    stored = await createBugReport(bugTenantId, record);
  } catch (cause) {
    console.error("Failed to store bug report", cause);
  }

  let githubIssueUrl: string | undefined;
  if (githubToken()) {
    try {
      const issue = await createGithubBugIssue({
        id: stored?.id ?? crypto.randomUUID(),
        description: record.description,
        path: record.path,
        userAgent: record.userAgent,
        userEmail: record.userEmail,
        userRole: record.userRole,
        logText: record.logText,
        screenshot: record.screenshot,
        storedInApp: Boolean(stored),
      });
      githubIssueUrl = issue?.url;
      if (stored && githubIssueUrl) {
        await attachBugReportGithubIssue(stored.id, githubIssueUrl);
      }
    } catch (cause) {
      console.error("Failed to open GitHub issue for bug report", cause);
    }
  }

  if (!stored && !githubIssueUrl) {
    return error("Could not save the bug report. Please try again.", 503);
  }

  return json(
    {
      ok: true,
      id: stored?.id ?? "github-only",
      githubIssueUrl,
      stored: Boolean(stored),
      user: bugReportUserLabel(record.userEmail, record.userRole),
    },
    201,
  );
}
