/**
 * Chat bubbles use pre-wrap; pasted or mobile keyboards can insert huge blank runs.
 * Collapse those for display without changing stored activity text.
 */
export function displayChatMessageText(raw: string): string {
  if (!raw) {
    return raw;
  }
  const normalized = raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+\n/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n");
  return normalized.trim();
}
