export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isUnauthorized(error: unknown) {
  return isApiError(error) && error.status === 401;
}

export function isForbidden(error: unknown) {
  return isApiError(error) && error.status === 403;
}

export function isNotFound(error: unknown) {
  return isApiError(error) && error.status === 404;
}

export function errorMessage(error: unknown, fallback = "Something went wrong") {
  if (isApiError(error) || error instanceof Error) {
    return error.message;
  }
  return fallback;
}
