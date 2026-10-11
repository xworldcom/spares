import {
  SPARES_DISPLAY_LOCALE,
  SPARES_DISPLAY_TIME_ZONE,
} from "./display-datetime.ts";

/** Format ISO timestamps and calendar dates (YYYY-MM-DD) for display. */
export function formatCalendarDay(
  value?: string,
  timeZone: string = SPARES_DISPLAY_TIME_ZONE,
) {
  if (!value) {
    return "—";
  }
  const date = new Date(
    value.includes("T") ? value : `${value}T12:00:00.000Z`,
  );
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(SPARES_DISPLAY_LOCALE, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}
