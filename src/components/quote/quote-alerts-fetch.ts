import { ApiError } from "@/lib/api/errors";
import { listQuotes } from "@/lib/api/quotes";

const INITIAL_DELAY_MS = 450;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 600;

function isRetryableQuoteAlertsError(cause: unknown) {
  if (cause instanceof ApiError) {
    return cause.status === 0;
  }
  return true;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function fetchQuoteAlertsUnreadCount() {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const data = await listQuotes({ background: true });
      return data.unreadCount;
    } catch (cause) {
      lastError = cause;
      if (!isRetryableQuoteAlertsError(cause) || attempt >= MAX_ATTEMPTS - 1) {
        throw cause;
      }
      await sleep(BASE_BACKOFF_MS * 2 ** attempt);
    }
  }
  throw lastError;
}

export function scheduleQuoteAlertsInitialLoad(run: () => Promise<void>) {
  const timer = window.setTimeout(() => {
    void run();
  }, INITIAL_DELAY_MS);
  return () => window.clearTimeout(timer);
}
