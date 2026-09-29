const PASSWORD_JSON =
  /("(?:password|passwd|pass|secret|token|authorization|auth_secret|github_token|s3_secret_access_key|blob_read_write_token|x-vercel-protection-bypass)"\s*:\s*")([^"]*)(")/gi;
const PASSWORD_QUERY =
  /([?&](?:password|passwd|pass|secret|token|authorization|x-vercel-protection-bypass|x-vercel-set-bypass-cookie)=)([^&]*)/gi;
const PASSWORD_PAIR =
  /\b(password|passwd|pass|secret|token|authorization|AUTH_SECRET|GITHUB_TOKEN|SPARES_GITHUB_TOKEN|S3_SECRET_ACCESS_KEY|BLOB_READ_WRITE_TOKEN|x-vercel-protection-bypass)\s*[:=]\s*[^\s&]+/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._\-+=/]+/gi;

export function stripSecrets(value: string) {
  return value
    .replace(PASSWORD_JSON, "$1[redacted]$3")
    .replace(PASSWORD_QUERY, "$1[redacted]")
    .replace(PASSWORD_PAIR, "$1=[redacted]")
    .replace(BEARER, "Bearer [redacted]");
}

export function bugReportTitle(description: string) {
  const clipped = description.replace(/\s+/g, " ").trim().slice(0, 70);
  return `[bug-report] ${clipped}`;
}

export function bugReportUserLabel(email?: string, role?: string) {
  if (email && role) {
    return `${email} (${role})`;
  }
  if (email) {
    return email;
  }
  return "signed out";
}

export function bugReportIssueBody(input: {
  description: string;
  path: string;
  userLabel: string;
  userAgent: string;
  logText: string;
  screenshotUrl?: string;
  storedInApp?: boolean;
}) {
  const lines = [
    "## What's going on?",
    "",
    input.description.trim() || "(no description)",
    "",
    "## Context",
    "",
    `- Path: \`${input.path || "/"}\``,
    `- User: ${input.userLabel}`,
    `- User agent: ${input.userAgent || "(unknown)"}`,
  ];

  if (input.screenshotUrl) {
    lines.push("", "## Screenshot", "", `![Page screenshot](${input.screenshotUrl})`);
  } else if (input.storedInApp) {
    lines.push(
      "",
      "## Screenshot",
      "",
      "Screenshot is in Bug reports (`/staff/bugs`).",
    );
  }

  const log = input.logText.trim() || "(empty)";
  lines.push("", "## Client log", "", "```", log, "```");
  return lines.join("\n");
}

export function parseJpegBase64(input: string): Buffer | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const comma = trimmed.indexOf(",");
  const base64 =
    trimmed.startsWith("data:") && comma >= 0 ? trimmed.slice(comma + 1) : trimmed;
  try {
    const bytes = Buffer.from(base64, "base64");
    return bytes.length > 0 ? bytes : null;
  } catch {
    return null;
  }
}
