/** Viewer read cursor — never earlier than the latest thread activity. */
export function readWatermarkNow(activities: readonly { at: string }[]) {
  const now = new Date().toISOString();
  const latest = activities.at(-1)?.at;
  if (!latest) {
    return now;
  }
  return latest > now ? latest : now;
}
