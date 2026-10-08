import { NextResponse } from "next/server";
export { catalogConflictResponse, withCatalogConflict } from "./catalog-conflict.ts";

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
