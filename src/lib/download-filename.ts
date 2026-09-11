/** Filename for Content-Disposition. Strips path parts and header-breaking characters. */
export function safeDownloadFilename(name: string, fallback = "download") {
  const base = name.split(/[/\\]/).pop()?.trim() || fallback;
  const cleaned = base.replace(/[\r\n\t"]/g, "_").slice(0, 180);
  return cleaned || fallback;
}
