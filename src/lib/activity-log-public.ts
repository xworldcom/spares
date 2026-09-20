/**
 * Staff Activity Log is paused. Live poll rewrote private Blob JSON about every
 * 1.5s per open tab. Keep the code; turn this on (or set SPARES_ACTIVITY_LOG=true)
 * when a cheaper store or a slower refresh is ready.
 */
export const ACTIVITY_LOG_ENABLED = false;

export function isActivityLogEnabled() {
  if (process.env.SPARES_ACTIVITY_LOG === "true") {
    return true;
  }
  if (process.env.SPARES_ACTIVITY_LOG === "false") {
    return false;
  }
  if (process.env.NODE_TEST_CONTEXT) {
    return true;
  }
  return ACTIVITY_LOG_ENABLED;
}
