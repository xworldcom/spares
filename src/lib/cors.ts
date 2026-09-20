/**
 * Fail-closed CORS for who may mint signed R2 URLs.
 *
 * The private bucket uses `*` CORS so a browser that already has a signed URL
 * can GET/PUT without streaming through Vercel. API routes still reject
 * unknown Origins before they can sign anything.
 */

/** Soft Launch / production aliases that may mint signed object URLs. */
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

/** Exact origins allowed to mint signed model/manual/chat URLs. */
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

/** Browser cross-site POSTs send Origin. Same-origin and non-browser clients pass. */
export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("Origin");
  if (!origin) {
    return true;
  }
  try {
    return normalizeOrigin(origin) === normalizeOrigin(new URL(request.url).origin);
  } catch {
    return false;
  }
}

/**
 * Presigned R2 GET/PUT URLs are used for every origin the app already allows,
 * including Spares preview hosts. The bucket CORS policy uses `*` for GET/HEAD/PUT
 * so those signed URLs work without streaming bytes through Vercel. The app still
 * fail-closes who can mint a URL (`rejectDisallowedOrigin` / auth).
 */
export function shouldUseCrossOriginObjectUrl(request: Request) {
  return isAllowedModelAssetOrigin(requestOrigin(request));
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

/**
 * S3-compatible CORS rules for the private models/manuals bucket.
 * `*` is safe here because objects stay private — the browser still needs a
 * short-lived signed URL, and those are only minted for authenticated app origins.
 */
export function r2ModelAssetCorsRules(): R2CorsRule[] {
  return [
    {
      AllowedOrigins: ["*"],
      AllowedMethods: ["GET", "HEAD", "PUT"],
      AllowedHeaders: ["*"],
      ExposeHeaders: ["ETag", "Content-Length", "Content-Type"],
      MaxAgeSeconds: 3600,
    },
  ];
}
