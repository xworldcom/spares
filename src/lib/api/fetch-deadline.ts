/** Client-side ceiling so superseded or stuck fetches do not hold warm-read slots forever. */
export const CLIENT_FETCH_DEADLINE_MS = 12_000;

export async function fetchWithDeadline(
  input: RequestInfo | URL,
  init?: RequestInit,
  deadlineMs = CLIENT_FETCH_DEADLINE_MS,
): Promise<Response> {
  const outerSignal = init?.signal;
  if (outerSignal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), deadlineMs);
  const onOuterAbort = () => controller.abort();
  outerSignal?.addEventListener("abort", onOuterAbort);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    outerSignal?.removeEventListener("abort", onOuterAbort);
  }
}

export function isAbortError(cause: unknown) {
  return (
    cause instanceof DOMException &&
    (cause.name === "AbortError" || cause.code === 20)
  );
}
