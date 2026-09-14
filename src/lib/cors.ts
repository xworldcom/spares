/**
 * Fail-closed CORS for Spares model/manual asset delivery.
 *
 * Browser fetches of presigned R2 URLs require matching bucket CORS rules.
 * API routes that stream bytes or sign upload URLs use the same allowlist.
 */

/** Soft Launch deployment aliases (also applied to the R2 bucket via configure-r2-cors). */
export const SPARES_SOFT_LAUNCH_ORIGINS = [
  "https://spares-yonder3.vercel.app",
  "https://spares-liart.vercel.app",
  "https://oee360.com",
  "https://www.oee360.com",
] as const;

/** Local development hosts. */
export const SPARES_LOCAL_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
] as const;

/** Vercel preview / branch deploy hostnames for this project. */
const SPARES_VERCEL_ORIGIN_RE =
  /^https:\/\/spares-[a-z0-9][a-z0-9-]*\.vercel\.app$/;

export type R2CorsRule = {
  AllowedOrigins: string[];
  AllowedMethods: string[];
  AllowedHeaders: string[];
  ExposeHeaders: string[];
  MaxAgeSeconds: number;
};

function normalizeOrigin(origin: string) {
  return origin.trim().replace(/\/$/, "");
}

function parseExtraOrigins() {
  const raw = process.env.SPARES_CORS_ORIGINS?.trim();
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((value) => normalizeOrigin(value))
    .filter(Boolean);
}

/** Exact origins written to the private R2 bucket CORS policy. */
export function r2CorsOrigins(): string[] {
  const origins = new Set<string>([
    ...SPARES_SOFT_LAUNCH_ORIGINS,
    ...SPARES_LOCAL_DEV_ORIGINS,
    ...parseExtraOrigins(),
  ]);
  return [...origins].sort();
}

/** Whether a browser Origin may access Spares model/manual assets. */
export function isAllowedModelAssetOrigin(origin: string | null | undefined) {
  if (!origin) {
    return false;
  }
  const normalized = normalizeOrigin(origin);
  if (!normalized) {
    return false;
  }
  if (r2CorsOrigins().includes(normalized)) {
    return true;
  }
  return SPARES_VERCEL_ORIGIN_RE.test(normalized);
}

export function requestOrigin(request: Request) {
  const header = request.headers.get("Origin");
  if (header) {
    return normalizeOrigin(header);
  }
  try {
    return normalizeOrigin(new URL(request.url).origin);
  } catch {
    return null;
  }
}

/**
 * Presigned R2 GET/PUT URLs only work in the browser when the page origin is
 * listed on the bucket CORS policy. Preview deploys that match the Spares
 * hostname pattern but are not in the bucket list fall back to the credentialed
 * same-origin proxy (server streams from R2).
 */
export function shouldUseCrossOriginObjectUrl(request: Request) {
  const origin = requestOrigin(request);
  if (!origin) {
    return false;
  }
  return r2CorsOrigins().includes(origin);
}

export function corsHeadersForOrigin(origin: string | null | undefined) {
  if (!origin || !isAllowedModelAssetOrigin(origin)) {
    return null;
  }
  const normalized = normalizeOrigin(origin);
  return {
    "Access-Control-Allow-Origin": normalized,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

export function withModelAssetCors(
  request: Request,
  headers: Record<string, string>,
) {
  const cors = corsHeadersForOrigin(requestOrigin(request));
  return cors ? { ...headers, ...cors } : headers;
}

export function corsPreflightResponse(request: Request) {
  const origin = request.headers.get("Origin");
  const cors = corsHeadersForOrigin(origin);
  if (!cors) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, {
    status: 204,
    headers: {
      ...cors,
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "3600",
    },
  });
}

/** Reject browser requests that carry a disallowed Origin header. */
export function rejectDisallowedOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  if (!origin) {
    return null;
  }
  if (isAllowedModelAssetOrigin(origin)) {
    return null;
  }
  return new Response(JSON.stringify({ error: "Origin not allowed" }), {
    status: 403,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
  });
}

/** S3-compatible CORS rules for the private models/manuals bucket. */
export function r2ModelAssetCorsRules(): R2CorsRule[] {
  const origins = r2CorsOrigins();
  return [
    {
      AllowedOrigins: origins,
      AllowedMethods: ["GET", "HEAD", "PUT"],
      AllowedHeaders: ["*"],
      ExposeHeaders: ["ETag", "Content-Length", "Content-Type"],
      MaxAgeSeconds: 3600,
    },
  ];
}
