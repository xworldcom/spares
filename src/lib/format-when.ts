import {
  SPARES_DISPLAY_LOCALE,
  SPARES_DISPLAY_TIME_ZONE,
} from "./display-datetime.ts";

export function formatWhen(value: string, timeZone: string = SPARES_DISPLAY_TIME_ZONE) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(SPARES_DISPLAY_LOCALE, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}
