export const CATALOG_CONFLICT_CODE = "catalog-conflict";

export const CATALOG_CONFLICT_MESSAGE =
  "Someone saved at the same moment, so nothing was changed. Please try again.";

/**
 * The stored catalog changed between this request's read and its write, and the retry
 * budget ran out. Nothing was written; the caller may safely retry the whole request.
 */
export class CatalogWriteConflictError extends Error {
  constructor() {
    super("The catalog kept changing while saving. Nothing was overwritten — please retry.");
    this.name = "CatalogWriteConflictError";
  }
}

/** A write that lost every compare-and-swap retry is a retryable conflict, not a server fault. */
export function catalogConflictResponse() {
  return Response.json(
    { error: CATALOG_CONFLICT_MESSAGE, code: CATALOG_CONFLICT_CODE },
    { status: 409, headers: { "Cache-Control": "private, no-store", "Retry-After": "1" } },
  );
}

export function withCatalogConflict<A extends unknown[], R extends Response | undefined>(
  handler: (...args: A) => Promise<R>,
) {
  return async (...args: A): Promise<R | Response> => {
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
