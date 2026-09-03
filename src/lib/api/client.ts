import { ApiError } from "./errors";
import type { ApiErrorBody } from "./types";

function readErrorMessage(body: unknown, status: number) {
  if (body && typeof body === "object" && "error" in body) {
    const message = (body as ApiErrorBody).error;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  if (status === 401) {
    return "You are not signed in.";
  }
  if (status === 403) {
    return "You do not have access to this.";
  }
  if (status === 404) {
    return "Not found.";
  }
  return `Request failed (${status})`;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    const headers = new Headers(init?.headers);
    const isFormData =
      typeof FormData !== "undefined" && init?.body instanceof FormData;
    if (!isFormData && init?.body != null && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    response = await fetch(path, {
      ...init,
      credentials: "include",
      headers,
    });
  } catch {
    throw new ApiError(
      "Could not reach the API. It may not be available on this preview yet.",
      0,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const body: unknown = isJson
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");

  if (!response.ok) {
    throw new ApiError(readErrorMessage(body, response.status), response.status);
  }

  return body as T;
}
