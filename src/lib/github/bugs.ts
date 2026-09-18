import {
  bugReportIssueBody,
  bugReportTitle,
  bugReportUserLabel,
} from "@/lib/bug-report/format";

const OWNER = "xworldcom";
const REPO = "spares";

export function githubToken() {
  // Prefer a scoped PAT stored only in Vercel env. GITHUB_TOKEN is last-resort
  // fallback for an already-configured Preview — do not copy a cloud-agent token.
  return (
    process.env.SPARES_GITHUB_TOKEN ||
    process.env.BUG_REPORT_GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.GITHUB_TOKEN ||
    ""
  ).trim();
}

type GithubJson<T> = {
  ok: boolean;
  status: number;
  data: T | null;
};

async function githubJson<T>(
  token: string,
  apiPath: string,
  init?: RequestInit,
): Promise<GithubJson<T>> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-GitHub-Api-Version", "2022-11-28");
  headers.set("User-Agent", "spares-bug-report");
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`https://api.github.com${apiPath}`, {
    ...init,
    headers,
  });
  const text = await response.text();
  let data: T | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = null;
    }
  }
  return { ok: response.ok, status: response.status, data };
}

const BUG_LABELS: { name: string; color: string; description: string }[] = [
  {
    name: "bug",
    color: "d73a4a",
    description: "Something isn't working",
  },
  {
    name: "needs-review",
    color: "fbca04",
    description: "Needs triage before automation or merge",
  },
];

async function ensureBugLabels(token: string) {
  for (const label of BUG_LABELS) {
    const existing = await githubJson(
      token,
      `/repos/${OWNER}/${REPO}/labels/${encodeURIComponent(label.name)}`,
    );
    if (existing.ok) {
      continue;
    }
    await githubJson(token, `/repos/${OWNER}/${REPO}/labels`, {
      method: "POST",
      body: JSON.stringify(label),
    });
  }
}

export class GithubBugIssueError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "GithubBugIssueError";
    this.status = status;
  }
}

function githubErrorDetail(data: unknown) {
  if (data && typeof data === "object" && "message" in data) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }
  return "GitHub API error";
}

async function uploadUserAttachment(
  token: string,
  jpeg: Buffer,
  fileName: string,
): Promise<string | null> {
  const repo = await githubJson<{ id: number }>(token, `/repos/${OWNER}/${REPO}`);
  if (!repo.ok || !repo.data?.id) {
    return null;
  }

  const url = new URL("https://uploads.github.com/user-attachments/assets");
  url.searchParams.set("name", fileName);
  url.searchParams.set("content_type", "image/jpeg");
  url.searchParams.set("repository_id", String(repo.data.id));

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "User-Agent": "spares-bug-report",
    },
    body: new Uint8Array(jpeg),
  });
  if (!response.ok) {
    return null;
  }
  const payload = (await response.json().catch(() => null)) as {
    href?: string;
    url?: string;
  } | null;
  return payload?.href || payload?.url || null;
}

async function ensureBugReportsBranch(token: string) {
  const repo = await githubJson<{ default_branch: string }>(
    token,
    `/repos/${OWNER}/${REPO}`,
  );
  if (!repo.ok || !repo.data?.default_branch) {
    return false;
  }

  const existing = await githubJson(
    token,
    `/repos/${OWNER}/${REPO}/git/ref/heads/bug-reports`,
  );
  if (existing.ok) {
    return true;
  }

  const head = await githubJson<{ object: { sha: string } }>(
    token,
    `/repos/${OWNER}/${REPO}/git/ref/heads/${repo.data.default_branch}`,
  );
  if (!head.ok || !head.data?.object?.sha) {
    return false;
  }

  const created = await githubJson(token, `/repos/${OWNER}/${REPO}/git/refs`, {
    method: "POST",
    body: JSON.stringify({
      ref: "refs/heads/bug-reports",
      sha: head.data.object.sha,
    }),
  });
  return created.ok || created.status === 422;
}

async function uploadViaContents(
  token: string,
  id: string,
  jpeg: Buffer,
): Promise<string | null> {
  if (!(await ensureBugReportsBranch(token))) {
    return null;
  }
  const filePath = `bug-reports/${id}.jpg`;
  const put = await githubJson(
    token,
    `/repos/${OWNER}/${REPO}/contents/${filePath}`,
    {
      method: "PUT",
      body: JSON.stringify({
        message: `[bug-report] screenshot ${id}`,
        content: jpeg.toString("base64"),
        branch: "bug-reports",
      }),
    },
  );
  if (!put.ok) {
    return null;
  }
  return `https://github.com/${OWNER}/${REPO}/blob/bug-reports/${filePath}?raw=1`;
}

async function uploadScreenshot(
  token: string,
  id: string,
  jpeg?: Buffer,
): Promise<string | undefined> {
  if (!jpeg?.length) {
    return undefined;
  }
  const attached = await uploadUserAttachment(token, jpeg, `bug-${id}.jpg`);
  if (attached) {
    return attached;
  }
  return (await uploadViaContents(token, id, jpeg)) ?? undefined;
}

export async function createGithubBugIssue(input: {
  id: string;
  description: string;
  path: string;
  userAgent: string;
  userEmail?: string;
  userRole?: string;
  logText: string;
  screenshot?: Buffer;
  storedInApp: boolean;
}): Promise<{ url: string; number: number } | null> {
  const token = githubToken();
  if (!token) {
    return null;
  }

  await ensureBugLabels(token);
  const screenshotUrl = await uploadScreenshot(token, input.id, input.screenshot);
  const body = bugReportIssueBody({
    description: input.description,
    path: input.path,
    userLabel: bugReportUserLabel(input.userEmail, input.userRole),
    userAgent: input.userAgent,
    logText: input.logText,
    screenshotUrl,
    storedInApp: input.storedInApp,
  });

  const created = await githubJson<{ html_url: string; number: number }>(
    token,
    `/repos/${OWNER}/${REPO}/issues`,
    {
      method: "POST",
      body: JSON.stringify({
        title: bugReportTitle(input.description),
        body,
        labels: ["bug", "needs-review"],
      }),
    },
  );

  if (created.ok && created.data?.html_url) {
    return { url: created.data.html_url, number: created.data.number };
  }

  const unlabeled = await githubJson<{ html_url: string; number: number }>(
    token,
    `/repos/${OWNER}/${REPO}/issues`,
    {
      method: "POST",
      body: JSON.stringify({
        title: bugReportTitle(input.description),
        body,
        labels: ["bug"],
      }),
    },
  );
  if (unlabeled.ok && unlabeled.data?.html_url) {
    return { url: unlabeled.data.html_url, number: unlabeled.data.number };
  }

  const status = unlabeled.status || created.status;
  const detail = githubErrorDetail(unlabeled.data ?? created.data);
  throw new GithubBugIssueError(
    `Could not open GitHub issue (${status}): ${detail}`,
    status,
  );
}
