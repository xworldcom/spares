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
