import { NextResponse } from "next/server";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
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
