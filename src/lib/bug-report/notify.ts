export function bugReportWebhookUrl() {
  return (
    process.env.BUG_REPORT_WEBHOOK_URL ||
    process.env.SPARES_BUG_REPORT_WEBHOOK_URL ||
    ""
  ).trim();
}

export type BugReportWebhookPayload = {
  githubIssueUrl: string;
  issueNumber: number;
  title: string;
  description: string;
  path: string;
  userEmail?: string;
  userRole?: string;
};

export async function notifyBugReportWebhook(
  payload: BugReportWebhookPayload,
): Promise<{ sent: boolean }> {
  const url = bugReportWebhookUrl();
  if (!url) {
    return { sent: false };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "bug-report",
        ...payload,
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error(
        "Bug report webhook failed",
        response.status,
        text.slice(0, 500),
      );
      return { sent: false };
    }
    return { sent: true };
  } catch (cause) {
    console.error("Bug report webhook error", cause);
    return { sent: false };
  }
}
