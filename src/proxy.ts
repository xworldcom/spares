import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { stripCredentialSearchParams } from "@/lib/auth/safe-url";

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  if (stripCredentialSearchParams(url.searchParams)) {
    return NextResponse.redirect(url, 303);
  }
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const proxyConfig = {
  // Skip /api so large multipart fallbacks are not cloned into the proxy buffer.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
