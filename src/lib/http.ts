import { NextResponse } from "next/server";
import {
  CATALOG_CONFLICT_CODE,
  CATALOG_CONFLICT_MESSAGE,
  CatalogWriteConflictError,
} from "./catalog-conflict.ts";

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

/** A write that lost every compare-and-swap retry is a retryable conflict, not a server fault. */
export function catalogConflictResponse() {
  return NextResponse.json(
    { error: CATALOG_CONFLICT_MESSAGE, code: CATALOG_CONFLICT_CODE },
    { status: 409, headers: { ...NO_STORE, "Retry-After": "1" } },
  );
}

export function withCatalogConflict<A extends unknown[], R extends Response | undefined>(
  handler: (...args: A) => Promise<R>,
) {
  return async (...args: A): Promise<R | NextResponse> => {
    try {
      return await handler(...args);
    } catch (cause) {
      if (cause instanceof CatalogWriteConflictError) {
        return catalogConflictResponse();
      }
      throw cause;
    }
  };
}
