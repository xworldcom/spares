/** Format ISO timestamps and calendar dates (YYYY-MM-DD) for display. */
export function formatCalendarDay(value?: string) {
  if (!value) {
    return "—";
  }
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
