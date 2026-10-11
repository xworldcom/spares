import { formatCalendarDay } from "@/lib/format-calendar-day";
import { SPARES_DISPLAY_TIME_ZONE } from "@/lib/display-datetime";
import { formatWhen as formatWhenLib } from "@/lib/format-when";

export function formatWhen(value: string, timeZone: string = SPARES_DISPLAY_TIME_ZONE) {
  return formatWhenLib(value, timeZone);
}

export function formatDay(value?: string, timeZone: string = SPARES_DISPLAY_TIME_ZONE) {
  return formatCalendarDay(value, timeZone);
}
