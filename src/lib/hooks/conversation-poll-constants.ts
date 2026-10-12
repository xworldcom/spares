/** Background refresh while a Care/quote thread stays open (peer messages + status). */
export const CONVERSATION_POLL_MS = 1500;

/** ETag freshness check while quote/ticket detail is open — never faster than 60s. */
export const RECORD_FRESHNESS_POLL_MS = 60_000;

/** Staff Activity Log — background refresh; keep off hot Blob paths. */
export const ACTIVITY_LOG_POLL_MS = 60_000;
