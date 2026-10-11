import { formatCalendarDay } from "@/lib/format-calendar-day";
import {
  SPARES_DISPLAY_LOCALE,
  SPARES_DISPLAY_TIME_ZONE,
} from "@/lib/display-datetime";

export function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(SPARES_DISPLAY_LOCALE, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: SPARES_DISPLAY_TIME_ZONE,
  });
}

export function formatDay(value?: string) {
  return formatCalendarDay(value);
}
