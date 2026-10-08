import { requireUser } from "@/lib/auth";
import { requireTenantStaff } from "@/lib/auth/tenant-scope";
import { isSameOriginRequest } from "@/lib/cors";
import { DEFAULT_TENANT_ID, tenantIdForUser } from "@/lib/tenant";
import {
  bugReportTitle,
  bugReportUserLabel,
  parseJpegBase64,
  stripSecrets,
} from "@/lib/bug-report/format";
import { bugReportWebhookUrl, notifyBugReportWebhook } from "@/lib/bug-report/notify";
import { createGithubBugIssue, githubToken } from "@/lib/github/bugs";
import { error, isErrorResponse, json, readJson, withCatalogConflict } from "@/lib/http";
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
  website?: unknown;
};

const MAX_DESCRIPTION = 8000;
const MAX_LOG = 32_000;
const MAX_SCREENSHOT = Math.floor(2 * 1024 * 1024);
const MIN_DESCRIPTION = 8;
const BUG_IP_LIMIT = 5;
const BUG_IP_WINDOW_MS = 60_000;
const BUG_USER_LIMIT = 8;
const BUG_USER_WINDOW_MS = 60 * 60_000;

function clip(value: string, max: number) {
  return value.length > max ? value.slice(0, max) : value;
}

function githubDeliveryRequired() {
  return Boolean(process.env.VERCEL) || Boolean(githubToken());
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

async function handlePOST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return error("Origin not allowed", 403);
  }

  const body = await readJson<CreateBugBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }

  if (typeof body.website === "string" && body.website.trim()) {
    return json({ ok: true, id: "discarded", stored: false, githubIssueUrl: undefined }, 201);
  }

  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }
  const sessionUser = auth.user;

  const ip = clientIp(request);
  if (!allowRateLimit(`bugs:ip:${ip}`, BUG_IP_LIMIT, BUG_IP_WINDOW_MS)) {
    return error("Too many bug reports. Try again in a minute.", 429);
  }
  if (
    !allowRateLimit(`bugs:user:${sessionUser.id}`, BUG_USER_LIMIT, BUG_USER_WINDOW_MS)
  ) {
    return error("You have sent several reports recently. Try again later.", 429);
  }

  const description =
    typeof body.description === "string" ? stripSecrets(body.description.trim()) : "";
  if (!description) {
    return error("description is required", 400);
  }
  if (description.length < MIN_DESCRIPTION) {
    return error(`Please add a bit more detail (at least ${MIN_DESCRIPTION} characters).`, 400);
  }

  const userEmail = sessionUser.email;
  const userRole = sessionUser.role;
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

  const bugTenantId = tenantIdForUser(sessionUser) ?? DEFAULT_TENANT_ID;
  const mustDeliverGithub = githubDeliveryRequired();

  if (mustDeliverGithub && !githubToken()) {
    console.error(
      "Bug report rejected: set SPARES_GITHUB_TOKEN or BUG_REPORT_GITHUB_TOKEN on Vercel",
    );
    return error(
      "Bug reporting is temporarily unavailable. Contact your OEE360 administrator.",
      503,
    );
  }

  let stored: Awaited<ReturnType<typeof createBugReport>> | null = null;
  try {
    stored = await createBugReport(bugTenantId, record);
  } catch (cause) {
    console.error("Failed to store bug report", cause);
  }

  let githubIssueUrl: string | undefined;
  let githubIssueNumber: number | undefined;

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
      githubIssueNumber = issue?.number;
      if (stored && githubIssueUrl) {
        await attachBugReportGithubIssue(stored.id, githubIssueUrl);
      }
      if (githubIssueUrl && githubIssueNumber != null) {
        const webhook = await notifyBugReportWebhook({
          githubIssueUrl,
          issueNumber: githubIssueNumber,
          title: bugReportTitle(record.description),
          description: record.description,
          path: record.path,
          userEmail: record.userEmail,
          userRole: record.userRole,
        });
        if (!webhook.sent && bugReportWebhookUrl()) {
          console.error(
            "Bug report GitHub issue was created but BUG_REPORT_WEBHOOK_URL notify failed",
          );
        }
      }
    } catch (cause) {
      console.error("Failed to open GitHub issue for bug report", cause);
      if (mustDeliverGithub) {
        if (stored) {
          return error(
            "We saved your note for staff but could not open a GitHub issue. Try again in a few minutes or ask staff to check Bug reports.",
            502,
          );
        }
        return error("Could not file the bug report. Please try again.", 502);
      }
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

export const POST = withCatalogConflict(handlePOST);
