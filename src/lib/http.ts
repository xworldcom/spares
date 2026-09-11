import { NextResponse } from "next/server";

const NO_STORE = { "Cache-Control": "private, no-store" };

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

export function error(
  message: string,
  status: number,
  extraHeaders?: Record<string, string>,
) {
  return NextResponse.json(
    { error: message },
    { status, headers: { ...NO_STORE, ...extraHeaders } },
  );
}

/** Filename for Content-Disposition. Strips path parts and header-breaking characters. */
export function safeDownloadFilename(name: string, fallback = "download") {
  const base = name.split(/[/\\]/).pop()?.trim() || fallback;
  const cleaned = base.replace(/[\r\n\t"]/g, "_").slice(0, 180);
  return cleaned || fallback;
}

export async function readJson<T>(request: Request): Promise<T | NextResponse> {
  try {
    return (await request.json()) as T;
  } catch {
    return error("Invalid JSON body", 400);
  }
}

export function isErrorResponse(
  value: unknown,
): value is NextResponse {
  return value instanceof NextResponse;
}
